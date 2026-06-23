// ==============================
// 出席登録
// ==============================

const ATTENDANCE_SOURCE_QR = "github_pages_qr";

/**
 * 旧会員画面からの1件登録は、枠を特定できないため停止する。
 * 出席はQR画面から稽古枠を選択して登録する。
 */
function registerAttendance(memberId) {
  return {
    ok: false,
    member_id: memberId || "",
    message: "稽古枠の指定が必要です。QR出席画面から登録してください。"
  };
}

function getAttendanceSessionInfo(params) {
  const ctx = createSheetContext();
  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);

  if (!locationId || !billingBlockId) {
    return { ok: false, message: "location_id と billing_block_id が必要です。" };
  }

  const location = getLocations(ctx).find(row =>
    normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row)
  );
  if (!location) return { ok: false, message: "有効な道場が見つかりません。" };

  const block = getBillingBlocks(ctx).find(row =>
    normalizeId_(row["billing_block_id"]) === billingBlockId && isActiveMasterRow_(row)
  );
  if (!block || normalizeId_(block["location_id"]) !== locationId) {
    return { ok: false, message: "道場に対応する有効な課金枠が見つかりません。" };
  }

  const slots = getTrainingSlots(ctx)
    .filter(row =>
      normalizeId_(row["location_id"]) === locationId &&
      normalizeId_(row["billing_block_id"]) === billingBlockId &&
      isActiveMasterRow_(row)
    )
    .sort((a, b) => String(a["開始時刻"]).localeCompare(String(b["開始時刻"])))
    .map(row => ({
      slot_id: normalizeId_(row["slot_id"]),
      label: String(row["表示名"] || row["slot_id"]),
      start_time: formatTimeValue_(row["開始時刻"]),
      end_time: formatTimeValue_(row["終了時刻"]),
      duration_minutes: Number(row["稽古時間分"] || 60)
    }));

  if (slots.length === 0) return { ok: false, message: "稽古枠が登録されていません。" };

  return {
    ok: true,
    location_id: locationId,
    location_name: String(location["表示名"] || location["道場名"] || locationId),
    billing_block_id: billingBlockId,
    billing_block_name: String(block["表示名"] || billingBlockId),
    slots_per_charge: Number(block["1課金あたり枠数"] || 2),
    slots
  };
}

function registerAttendanceBatch(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    return registerAttendanceBatchLocked_(data || {});
  } finally {
    lock.releaseLock();
  }
}

function registerAttendanceBatchLocked_(data) {
  const ctx = createSheetContext();
  const teacherId = normalizeId_(data.teacher_id);
  const locationId = normalizeId_(data.location_id);
  const billingBlockId = normalizeId_(data.billing_block_id);
  const sessionId = normalizeId_(data.attendance_session_id) || ("ASES-" + Utilities.getUuid());
  const attendanceDate = parseAttendanceDate_(data.attendance_date);
  const targetMonth = Utilities.formatDate(attendanceDate, Session.getScriptTimeZone(), "yyyy-MM");
  const items = Array.isArray(data.attendance_items) ? data.attendance_items : [];

  if (!teacherId || !locationId || !billingBlockId) {
    return { ok: false, message: "先生・道場・課金枠を指定してください。" };
  }
  if (items.length === 0) return { ok: false, message: "出席対象がありません。" };

  validateAttendanceMasterData_(ctx, teacherId, locationId, billingBlockId);

  const members = {};
  getMembers(ctx).forEach(row => {
    if (isActiveMasterRow_(row)) members[normalizeId_(row["member_id"])] = row;
  });

  const slots = {};
  getTrainingSlots(ctx).forEach(row => {
    const slotId = normalizeId_(row["slot_id"]);
    if (
      slotId && isActiveMasterRow_(row) &&
      normalizeId_(row["location_id"]) === locationId &&
      normalizeId_(row["billing_block_id"]) === billingBlockId
    ) slots[slotId] = row;
  });

  const activeKeys = getActiveAttendanceKeySet(ctx, attendanceDate);
  const rows = [];
  const results = [];
  const requestKeys = {};

  items.forEach(item => {
    const memberId = normalizeId_(item.member_id);
    const slotIds = Array.isArray(item.slot_ids)
      ? Array.from(new Set(item.slot_ids.map(normalizeId_).filter(Boolean)))
      : [];
    const result = { member_id: memberId, registered_slot_ids: [], duplicate_slot_ids: [], errors: [] };

    if (!memberId || !members[memberId]) {
      result.errors.push("有効な会員が見つかりません。");
      results.push(result);
      return;
    }
    if (slotIds.length === 0) {
      result.errors.push("稽古枠が未選択です。");
      results.push(result);
      return;
    }

    slotIds.forEach(slotId => {
      const slot = slots[slotId];
      if (!slot) {
        result.errors.push("無効な稽古枠: " + slotId);
        return;
      }

      const key = makeAttendanceKey_(formatAttendanceDate_(attendanceDate), memberId, slotId);
      if (activeKeys[key] || requestKeys[key]) {
        result.duplicate_slot_ids.push(slotId);
        return;
      }

      requestKeys[key] = true;
      result.registered_slot_ids.push(slotId);
      rows.push({
        attendance_id: "ATT-" + Utilities.getUuid(),
        "稽古日": attendanceDate,
        "登録日時": new Date(),
        member_id: memberId,
        target_month: targetMonth,
        location_id: locationId,
        slot_id: slotId,
        billing_block_id: billingBlockId,
        teacher_id: teacherId,
        attendance_session_id: sessionId,
        "稽古時間分": Number(slot["稽古時間分"] || 60),
        "状態": "有効",
        source: String(data.source || ATTENDANCE_SOURCE_QR),
        "取消日時": "",
        "取消者teacher_id": "",
        "取消理由": "",
        "備考": ""
      });
    });

    results.push(result);
  });

  appendAttendanceRows(ctx, rows);

  return {
    ok: true,
    attendance_session_id: sessionId,
    registered_count: rows.length,
    duplicate_count: results.reduce((sum, result) => sum + result.duplicate_slot_ids.length, 0),
    results,
    message: rows.length + "枠を登録しました。"
  };
}

function validateAttendanceMasterData_(ctx, teacherId, locationId, billingBlockId) {
  const teacher = getTeachers(ctx).find(row =>
    normalizeId_(row["teacher_id"]) === teacherId && isActiveMasterRow_(row)
  );
  if (!teacher) throw new Error("有効な先生が見つかりません。");
  if (!isTrueValue_(teacher["出席受付可"])) throw new Error("この先生は出席受付不可です。");

  const location = getLocations(ctx).find(row =>
    normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row)
  );
  if (!location) throw new Error("有効な道場が見つかりません。");

  const block = getBillingBlocks(ctx).find(row =>
    normalizeId_(row["billing_block_id"]) === billingBlockId && isActiveMasterRow_(row)
  );
  if (!block || normalizeId_(block["location_id"]) !== locationId) {
    throw new Error("道場と課金枠の組み合わせが不正です。");
  }
}

function calculateAttendanceChargeCount(memberId, targetMonth, ctx) {
  ctx = ensureSheetContext(ctx);
  const target = normalizeMonth(targetMonth);
  const blockMap = {};
  getBillingBlocks(ctx).forEach(block => {
    if (isActiveMasterRow_(block)) blockMap[normalizeId_(block["billing_block_id"])] = block;
  });

  const groups = {};
  getAttendances(ctx).forEach(row => {
    if (!isActiveMasterRow_(row)) return;
    if (normalizeMonth(row["target_month"]) !== target) return;
    if (normalizeId_(row["member_id"]) !== normalizeId_(memberId)) return;

    const dateText = formatAttendanceDate_(row["稽古日"]);
    const blockId = normalizeId_(row["billing_block_id"]);
    const slotId = normalizeId_(row["slot_id"]);
    if (!dateText || !blockId || !slotId) return;

    const key = dateText + "|" + blockId;
    if (!groups[key]) groups[key] = {};
    groups[key][slotId] = true;
  });

  let chargeCount = 0;
  const details = [];
  Object.keys(groups).forEach(key => {
    const blockId = key.split("|")[1];
    const slotCount = Object.keys(groups[key]).length;
    const slotsPerCharge = Math.max(1, Number((blockMap[blockId] || {})["1課金あたり枠数"] || 2));
    const count = Math.ceil(slotCount / slotsPerCharge);
    chargeCount += count;
    details.push({ key, slot_count: slotCount, slots_per_charge: slotsPerCharge, charge_count: count });
  });

  return { charge_count: chargeCount, details };
}

function normalizeId_(value) {
  return String(value == null ? "" : value).trim();
}

function isActiveMasterRow_(row) {
  const status = normalizeId_(row["状態"]);
  return status === "" || status === "有効" || status === "在籍" || status === "TRUE";
}

function isTrueValue_(value) {
  return value === true || ["TRUE", "true", "1", "可", "有効"].includes(normalizeId_(value));
}

function parseAttendanceDate_(value) {
  if (!value) return new Date();
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("稽古日は yyyy-MM-dd 形式で指定してください。");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) throw new Error("稽古日が不正です。");
  return date;
}

function formatAttendanceDate_(value) {
  if (value === "" || value == null) return "";
  const date = value instanceof Date ? value : parseAttendanceDate_(value);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function formatTimeValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }
  return String(value == null ? "" : value).trim();
}

function makeAttendanceKey_(dateText, memberId, slotId) {
  return [dateText, normalizeId_(memberId), normalizeId_(slotId)].join("|");
}
