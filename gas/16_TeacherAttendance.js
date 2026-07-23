// 先生本人の出席事実を、会員出席とは独立して記録する。

const TEACHER_ATTENDANCE_SHEET = "16_先生出席ログ";
const TEACHER_ATTENDANCE_HEADERS = [
  "teacher_attendance_id", "稽古日", "登録日時", "teacher_id", "member_id",
  "location_id", "slot_id", "billing_block_id", "担当区分", "状態", "source",
  "取消日時", "取消理由"
];
const TEACHER_ROLE_LINK_HEADERS = ["member_id", "組織役割", "適用開始日", "適用終了日"];

function setupTeacherAttendance() {
  const result = teacherAttendance_ensureSchema(createSheetContext());
  const message = "先生出席のシート・先生役割列を確認しました。";
  Logger.log(JSON.stringify({
    message: message,
    result: result
  }, null, 2));
  SpreadsheetApp.getActiveSpreadsheet().toast(message, "先生出席セットアップ", 5);
  return result;
}

function teacherAttendance_ensureSchema(ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  let sheet = ctx.ss.getSheetByName(TEACHER_ATTENDANCE_SHEET);
  if (!sheet) {
    sheet = ctx.ss.insertSheet(TEACHER_ATTENDANCE_SHEET);
    sheet.getRange(1, 1, 1, TEACHER_ATTENDANCE_HEADERS.length).setValues([TEACHER_ATTENDANCE_HEADERS]);
  } else {
    teacherAttendance_addMissingHeaders_(sheet, TEACHER_ATTENDANCE_HEADERS);
  }
  const teacherSheet = getRequiredSheet_("11_先生マスタ", ctx);
  const addedTeacherHeaders = teacherAttendance_addMissingHeaders_(teacherSheet, TEACHER_ROLE_LINK_HEADERS);
  invalidateSheetRows(ctx, "11_先生マスタ");
  invalidateTeacherAttendances(ctx);
  return { ok:true, sheet_name:TEACHER_ATTENDANCE_SHEET, added_teacher_headers:addedTeacherHeaders };
}

function teacherAttendance_addMissingHeaders_(sheet, required) {
  const info = getHeaderMap_(sheet);
  const missing = required.filter(function(header) { return info.map[header] === undefined; });
  if (missing.length) sheet.getRange(1, info.headers.length + 1, 1, missing.length).setValues([missing]);
  return missing;
}

function teacherAttendance_getState(data, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  teacherAttendance_ensureSchema(ctx);
  data = data || {};
  const teacherId = normalizeId_(data.teacher_id);
  const locationId = normalizeId_(data.location_id);
  const blockId = normalizeId_(data.billing_block_id);
  const date = parseAttendanceDate_(data.attendance_date, ctx);
  if (!teacherId || !locationId || !blockId) return { ok:false, message:"先生・道場・課金枠を指定してください。" };
  const teacher = teacherAttendance_findTeacher_(teacherId, date, ctx);
  if (!teacher) return { ok:false, message:"有効な先生が見つかりません。" };
  const session = buildAttendanceSessionInfo_(teacherAttendance_findLocation_(locationId, ctx), blockId, false, ctx);
  if (!session.ok) return session;
  teacherAttendance_validateWeekday_(date, locationId, blockId, ctx);
  const rows = teacherAttendance_activeRows_(date, teacherId, locationId, blockId, ctx);
  const roles = {};
  rows.forEach(function(row) { roles[String(row["担当区分"] || "").trim()] = true; });
  return {
    ok:true,
    attendance_date:formatAttendanceDate_(date, ctx),
    teacher_id:teacherId,
    member_id:normalizeId_(teacher["member_id"]),
    teacher_name:teacherAttendance_teacherName_(teacher, ctx),
    organization_role:String(teacher["組織役割"] || "先生"),
    location_id:locationId,
    billing_block_id:blockId,
    role:Object.keys(roles)[0] || "主先生",
    selected_slot_ids:rows.map(function(row) { return normalizeId_(row["slot_id"]); }).filter(Boolean),
    slots:session.slots || []
  };
}

function teacherAttendance_sync(data, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ctx = ensureSheetContext(ctx || createSheetContext());
    teacherAttendance_ensureSchema(ctx);
    data = data || {};
    const teacherId = normalizeId_(data.teacher_id);
    const locationId = normalizeId_(data.location_id);
    const blockId = normalizeId_(data.billing_block_id);
    const role = String(data.role || "").trim();
    const slotIds = Array.from(new Set((Array.isArray(data.slot_ids) ? data.slot_ids : []).map(normalizeId_).filter(Boolean)));
    const date = parseAttendanceDate_(data.attendance_date, ctx);
    if (!teacherId || !locationId || !blockId) throw new Error("先生・道場・課金枠を指定してください。");
    if (["主先生", "副先生"].indexOf(role) < 0) throw new Error("担当区分は主先生または副先生を指定してください。");
    const teacher = teacherAttendance_findTeacher_(teacherId, date, ctx);
    if (!teacher) throw new Error("有効な先生が見つかりません。");
    const location = teacherAttendance_findLocation_(locationId, ctx);
    const session = buildAttendanceSessionInfo_(location, blockId, false, ctx);
    if (!session.ok) throw new Error(session.message);
    teacherAttendance_validateWeekday_(date, locationId, blockId, ctx);
    const allowed = (session.slots || []).map(function(slot) { return normalizeId_(slot.slot_id); });
    slotIds.forEach(function(slotId) { if (allowed.indexOf(slotId) < 0) throw new Error("課金枠にない稽古枠です: " + slotId); });

    const active = teacherAttendance_activeRows_(date, teacherId, locationId, blockId, ctx);
    const retained = [], cancelled = [], registered = [];
    active.forEach(function(row) {
      const slotId = normalizeId_(row["slot_id"]);
      if (slotIds.indexOf(slotId) >= 0 && String(row["担当区分"] || "").trim() === role && retained.indexOf(slotId) < 0) retained.push(slotId);
      else { teacherAttendance_cancelRow_(row, ctx); cancelled.push(slotId); }
    });
    const append = slotIds.filter(function(slotId) { return retained.indexOf(slotId) < 0; }).map(function(slotId) {
      registered.push(slotId);
      return {
        teacher_attendance_id:"TATT-" + Utilities.getUuid().slice(0, 8),
        "稽古日":formatAttendanceDate_(date, ctx),
        "登録日時":sup_now(ctx),
        teacher_id:teacherId,
        member_id:normalizeId_(teacher["member_id"]),
        location_id:locationId,
        slot_id:slotId,
        billing_block_id:blockId,
        "担当区分":role,
        "状態":"有効",
        source:String(data.source || "teacher_attendance.html")
      };
    });
    if (append.length) {
      appendObjectsByHeader_(getRequiredSheet_(TEACHER_ATTENDANCE_SHEET, ctx), append);
      invalidateTeacherAttendances(ctx);
    }
    return { ok:true, teacher_id:teacherId, role:role, registered_slot_ids:registered, retained_slot_ids:retained, cancelled_slot_ids:cancelled, message:"先生出席を登録しました。" };
  } finally {
    lock.releaseLock();
  }
}

function teacherAttendance_getMonthlySummary(data, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  teacherAttendance_ensureSchema(ctx);
  const month = normalizeMonth((data && data.target_month) || sup_targetMonth(ctx)).slice(0, 7);
  const grouped = {};
  getTeacherAttendances(ctx).filter(isActiveMasterRow_).forEach(function(row) {
    if (normalizeMonth(row["稽古日"]).slice(0, 7) !== month) return;
    const teacherId = normalizeId_(row["teacher_id"]);
    if (!teacherId) return;
    if (!grouped[teacherId]) grouped[teacherId] = { teacher_id:teacherId, main_count:0, sub_count:0, total_count:0 };
    if (String(row["担当区分"] || "").trim() === "副先生") grouped[teacherId].sub_count += 1;
    else grouped[teacherId].main_count += 1;
    grouped[teacherId].total_count += 1;
  });
  const teachers = getTeachers(ctx);
  const rows = Object.keys(grouped).map(function(teacherId) {
    const teacher = teachers.find(function(row) { return normalizeId_(row["teacher_id"]) === teacherId; }) || {};
    grouped[teacherId].teacher_name = teacherAttendance_teacherName_(teacher, ctx) || teacherId;
    grouped[teacherId].member_id = normalizeId_(teacher["member_id"]);
    return grouped[teacherId];
  }).sort(function(a, b) { return a.teacher_name.localeCompare(b.teacher_name, "ja"); });
  return { ok:true, target_month:month, teachers:rows, total_count:rows.reduce(function(sum, row) { return sum + row.total_count; }, 0) };
}

function teacherAttendance_activeRows_(date, teacherId, locationId, blockId, ctx) {
  const dateText = formatAttendanceDate_(date, ctx);
  return getTeacherAttendances(ctx).filter(function(row) {
    return isActiveMasterRow_(row) && formatAttendanceDate_(row["稽古日"], ctx) === dateText &&
      normalizeId_(row["teacher_id"]) === teacherId && normalizeId_(row["location_id"]) === locationId &&
      normalizeId_(row["billing_block_id"]) === blockId;
  });
}

function teacherAttendance_cancelRow_(row, ctx) {
  const sheet = getRequiredSheet_(TEACHER_ATTENDANCE_SHEET, ctx);
  const info = assertHeaders_(sheet, ["teacher_attendance_id", "状態", "取消日時", "取消理由"]);
  const id = normalizeId_(row["teacher_attendance_id"]);
  const values = sheet.getDataRange().getValues();
  for (let index = 1; index < values.length; index++) {
    if (normalizeId_(values[index][info.map["teacher_attendance_id"]]) !== id) continue;
    sheet.getRange(index + 1, info.map["状態"] + 1).setValue("取消");
    sheet.getRange(index + 1, info.map["取消日時"] + 1).setValue(sup_now(ctx));
    sheet.getRange(index + 1, info.map["取消理由"] + 1).setValue("先生出席画面の選択解除・担当変更");
    break;
  }
  invalidateTeacherAttendances(ctx);
}

function teacherAttendance_findTeacher_(teacherId, date, ctx) {
  const dateText = formatAttendanceDate_(date, ctx);
  return getTeachers(ctx).find(function(row) {
    if (normalizeId_(row["teacher_id"]) !== teacherId || !isActiveMasterRow_(row)) return false;
    const from = row["適用開始日"] ? formatAttendanceDate_(row["適用開始日"], ctx) : "";
    const to = row["適用終了日"] ? formatAttendanceDate_(row["適用終了日"], ctx) : "";
    return (!from || from <= dateText) && (!to || dateText <= to);
  });
}

function teacherAttendance_findLocation_(locationId, ctx) {
  const location = getLocations(ctx).find(function(row) { return normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row); });
  if (!location) throw new Error("有効な道場が見つかりません。");
  return location;
}

function teacherAttendance_validateWeekday_(date, locationId, blockId, ctx) {
  const block = getBillingBlocks(ctx).find(function(row) {
    return normalizeId_(row["billing_block_id"]) === blockId && normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row);
  });
  if (!block) throw new Error("有効な課金枠が見つかりません。");
  const weekday = getWeekdayLabel_(date);
  if (!weekdayMatches_(block["曜日"], weekday)) throw new Error("稽古日（" + weekday + "曜）と課金枠の曜日が一致しません。");
}

function teacherAttendance_teacherName_(teacher, ctx) {
  const memberId = normalizeId_(teacher["member_id"]);
  const member = memberId ? getMembers(ctx).find(function(row) { return normalizeId_(row["member_id"]) === memberId; }) : null;
  return String((member && member["氏名"]) || teacher["氏名"] || teacher["先生名"] || teacher["表示名"] || "");
}
