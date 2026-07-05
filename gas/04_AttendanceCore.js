// ========================================
// 04_AttendanceCore.js
// 出席共通Core
// ========================================
//
// TYPE: CORE
// AREA: ATTENDANCE
// TAG: ATTENDANCE
// TAG: CORE
// TAG: RDD
//
// require_teacher:
// true  = 先生操作として teacher_id を必須にする
// false = 会員セルフ操作として teacher_id を空許容する
// LEGACY COMPAT:
// 旧関数名互換のために残す。
// 新規実装では attendanceCore_findRowsForScope_ を使用する。

function attendanceCore_registerBatch_(options, ctx) {
  ctx = ensureSheetContext(ctx);

  options = options || {};

  const teacherId = normalizeId_(options.teacher_id);
  const locationId = normalizeId_(options.location_id);
  const billingBlockId = normalizeId_(options.billing_block_id);
  const sessionId = normalizeId_(options.attendance_session_id) || ("ASES-" + Utilities.getUuid());
  const attendanceDate = options.attendance_date || sup_today(ctx);
  const targetMonth = options.target_month || sup_targetMonth(ctx);
  const items = Array.isArray(options.attendance_items) ? options.attendance_items : [];

  const requireTeacher = options.require_teacher === true;
  const initialStatus = String(options.initial_status || "有効");
  const source = String(options.source || "attendance_core");
  const remarks = String(options.remarks || "");
  const syncUnselected = options.sync_unselected === true;
  const allowDuplicateMembers = options.allow_duplicate_members === true;

  if (requireTeacher) {
    if (!teacherId || !locationId || !billingBlockId) {
      return { ok: false, message: "先生・道場・課金枠を指定してください。" };
    }
    validateAttendanceMasterData_(teacherId, locationId, billingBlockId, ctx);
  } else {
    if (!locationId || !billingBlockId) {
      return { ok: false, message: "道場・課金枠を指定してください。" };
    }
    validateAttendanceScope_(locationId, billingBlockId, ctx);
  }

  if (items.length === 0) {
    return { ok: false, message: "出席対象がありません。" };
  }

  const members = attendanceCore_getMemberMap_(ctx);
  const slots = attendanceCore_getSlotMap_(locationId, billingBlockId, ctx);

  const rowsToAppend = [];
  const rowsToCancel = [];
  const results = [];
  const requestedMembers = {};

  items.forEach(function(item) {
    const memberId = normalizeId_(item.member_id);
    const hasSlotArray = Array.isArray(item.slot_ids);
    const slotIds = hasSlotArray
      ? Array.from(new Set(item.slot_ids.map(normalizeId_).filter(Boolean)))
      : [];

    const result = {
      member_id: memberId,
      registered_slot_ids: [],
      retained_slot_ids: [],
      cancelled_slot_ids: [],
      errors: []
    };

    if (!memberId || !members[memberId]) {
      result.errors.push("有効な会員が見つかりません。");
      results.push(result);
      return;
    }

    if (!allowDuplicateMembers && requestedMembers[memberId]) {
      result.errors.push("同じ会員が送信データ内で重複しています。");
      results.push(result);
      return;
    }
    requestedMembers[memberId] = true;

    if (!hasSlotArray) {
      result.errors.push("slot_ids は配列で指定してください。");
      results.push(result);
      return;
    }

    if (slotIds.length === 0) {
      result.errors.push("slot_ids が指定されていません。");
      results.push(result);
      return;
    }

    slotIds.forEach(function(slotId) {
      if (!slots[slotId]) {
        result.errors.push("無効な稽古枠: " + slotId);
      }
    });

    if (result.errors.length > 0) {
      results.push(result);
      return;
    }

    const existingRows = attendanceCore_findRowsForScope_({
      attendance_date: attendanceDate,
      member_id: memberId,
      location_id: locationId,
      billing_block_id: billingBlockId
    }, ctx);

    const existingBySlot = {};
    existingRows.forEach(function(row) {
      existingBySlot[normalizeId_(row["slot_id"])] = row;
    });

    if (syncUnselected) {
      existingRows.forEach(function(row) {
        const existingSlotId = normalizeId_(row["slot_id"]);
        if (slotIds.indexOf(existingSlotId) < 0) {
          rowsToCancel.push(row);
          result.cancelled_slot_ids.push(existingSlotId);
        }
      });
    }

    slotIds.forEach(function(slotId) {
      if (existingBySlot[slotId]) {
        result.retained_slot_ids.push(slotId);
        return;
      }

      const slot = slots[slotId];

      rowsToAppend.push({
        attendance_id: "ATT-" + Utilities.getUuid(),
        "稽古日": attendanceDate,
        "登録日時": sup_now(ctx),
        member_id: memberId,
        target_month: targetMonth,
        location_id: locationId,
        slot_id: slotId,
        billing_block_id: billingBlockId,
        teacher_id: teacherId,
        attendance_session_id: sessionId,
        "稽古時間分": Number(slot["稽古時間分"] || 60),
        "状態": initialStatus,
        source: source,
        "取消日時": "",
        "取消者teacher_id": "",
        "取消理由": "",
        "備考": remarks
      });

      result.registered_slot_ids.push(slotId);
    });

    results.push(result);
  });

  if (rowsToCancel.length > 0) {
    cancelAttendanceRows(
      rowsToCancel,
      teacherId,
      options.cancel_reason || "出席確認画面との同期による選択解除",
      ctx
    );
  }

  appendAttendanceRows(rowsToAppend, ctx);

  return {
    ok: true,
    attendance_session_id: sessionId,
    registered_count: rowsToAppend.length,
    retained_count: results.reduce(function(sum, result) {
      return sum + result.retained_slot_ids.length;
    }, 0),
    cancelled_count: rowsToCancel.length,
    results: results,
    message: String(options.message || "出席登録を処理しました。")
  };
}

function attendanceCore_getMemberMap_(ctx) {
  ctx = ensureSheetContext(ctx);

  const members = {};
  getMembers(ctx).forEach(function(row) {
    if (isActiveMasterRow_(row)) {
      members[normalizeId_(row["member_id"])] = row;
    }
  });
  return members;
}

function attendanceCore_getSlotMap_(locationId, billingBlockId, ctx) {
  ctx = ensureSheetContext(ctx);

  const slots = {};
  getTrainingSlots(ctx).forEach(function(row) {
    const slotId = normalizeId_(row["slot_id"]);

    if (
      slotId &&
      isActiveMasterRow_(row) &&
      normalizeId_(row["location_id"]) === normalizeId_(locationId) &&
      normalizeId_(row["billing_block_id"]) === normalizeId_(billingBlockId)
    ) {
      slots[slotId] = row;
    }
  });
  return slots;
}

function attendanceCore_findRowsForScope_(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = getRequiredSheet_("07_出席ログ", ctx);
  assertHeaders_(sheet, [
    "attendance_id",
    "稽古日",
    "member_id",
    "location_id",
    "billing_block_id",
    "slot_id",
    "teacher_id",
    "状態"
  ]);

  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const attendanceDate = parseAttendanceDate_(params.attendance_date, ctx);
  const dateText = formatAttendanceDate_(attendanceDate, ctx);

  return values.map(function(valuesRow, index) {
    const row = { _rowNumber: index + 2 };
    headers.forEach(function(header, column) {
      row[header] = valuesRow[column];
    });
    return row;
  }).filter(function(row) {
    if (formatAttendanceDate_(row["稽古日"], ctx) !== dateText) return false;

    if (params.member_id &&
        normalizeId_(row["member_id"]) !== normalizeId_(params.member_id)) return false;

    if (params.location_id &&
        normalizeId_(row["location_id"]) !== normalizeId_(params.location_id)) return false;

    if (params.billing_block_id &&
        normalizeId_(row["billing_block_id"]) !== normalizeId_(params.billing_block_id)) return false;

    if (params.status &&
        normalizeId_(row["状態"]) !== normalizeId_(params.status)) return false;

    return normalizeId_(row["状態"]) !== "取消";
  });
}

function attendanceCore_updateRows_(rows, updateValues, ctx) {
  ctx = ensureSheetContext(ctx);

  if (!rows || rows.length === 0) return;

  const sheet = getRequiredSheet_("07_出席ログ", ctx);
  const headerInfo = getHeaderMap_(sheet);
  const now = sup_now(ctx);

  rows.forEach(function(row) {
    const rowNumber = Number(row._rowNumber);
    if (!rowNumber || rowNumber < 2) {
      throw new Error("更新対象の行番号が不正です。");
    }

    Object.keys(updateValues || {}).forEach(function(header) {
      if (headerInfo.map[header] === undefined) return;
      sheet.getRange(rowNumber, headerInfo.map[header] + 1).setValue(updateValues[header]);
    });

    if (headerInfo.map["確認日時"] !== undefined) {
      sheet.getRange(rowNumber, headerInfo.map["確認日時"] + 1).setValue(now);
    }
  });

  invalidateAttendances(ctx);
}

// 互換用。既存名を使っている箇所のために残す。
function attendanceFindRowsForScope_(params, ctx) {
  return attendanceCore_findRowsForScope_(params, ctx);
}

function attendanceUpdateRows_(rows, updateValues, ctx) {
  return attendanceCore_updateRows_(rows, updateValues, ctx);
}