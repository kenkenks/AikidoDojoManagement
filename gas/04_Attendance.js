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

// doGet() で呼び出すと、JSONP形式で出席登録APIを呼び出せる。
function getAttendanceSessionInfo(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);

  if (!locationId) return { ok: false, message: "location_id が必要です。" };

  const location = getLocations(ctx).find(row =>
    normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row)
  );
  if (!location) return { ok: false, message: "有効な道場が見つかりません。" };

  if (billingBlockId) {
    return buildAttendanceSessionInfo_(location, billingBlockId, false, ctx);
  }

  const now = parseSessionDateTime_(params.at, ctx);
  const candidates = findBillingBlockCandidates_(locationId, now, ctx);
  const exactCandidates = candidates.filter(candidate => candidate.is_current);
  const nearbyCandidates = candidates.filter(candidate => candidate.is_nearby);

  if (exactCandidates.length === 1) {
    return buildAttendanceSessionInfo_(location, exactCandidates[0].billing_block_id, true, ctx);
  }
  if (exactCandidates.length === 0 && nearbyCandidates.length === 1) {
    return buildAttendanceSessionInfo_(location, nearbyCandidates[0].billing_block_id, true, ctx);
  }

  const choices = exactCandidates.length > 1
    ? exactCandidates
    : (nearbyCandidates.length > 0 ? nearbyCandidates : candidates);

  return {
    ok: true,
    location_id: locationId,
    location_name: String(location["表示名"] || location["道場名"] || locationId),
    requires_selection: true,
    billing_block_candidates: choices.map(candidate => ({
      billing_block_id: candidate.billing_block_id,
      label: candidate.label,
      start_time: candidate.start_time,
      end_time: candidate.end_time
    })),
    message: choices.length > 0
      ? "課金枠を自動判定できませんでした。候補から選択してください。"
      : "本日の課金枠がありません。"
  };
}

function buildAttendanceSessionInfo_(location, billingBlockId, inferred, ctx) {
  ctx = ensureSheetContext(ctx);
  
  const locationId = normalizeId_(location["location_id"]);
  const block = getBillingBlocks(ctx).find(row =>
    normalizeId_(row["billing_block_id"]) === billingBlockId &&
    normalizeId_(row["location_id"]) === locationId &&
    isActiveMasterRow_(row)
  );
  if (!block) return { ok: false, message: "道場に対応する有効な課金枠が見つかりません。" };

  const slots = getTrainingSlots(ctx)
    .filter(row =>
      normalizeId_(row["location_id"]) === locationId &&
      normalizeId_(row["billing_block_id"]) === billingBlockId &&
      isActiveMasterRow_(row)
    )
    .sort((a, b) => timeToMinutes_(a["開始時刻"]) - timeToMinutes_(b["開始時刻"]))
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
    requires_selection: false,
    inferred: inferred === true,
    location_id: locationId,
    location_name: String(location["表示名"] || location["道場名"] || locationId),
    billing_block_id: billingBlockId,
    billing_block_name: String(block["表示名"] || billingBlockId),
    slots_per_charge: Number(block["1課金あたり枠数"] || 2),
    slots
  };
}

function findBillingBlockCandidates_(locationId, dateTime, ctx) {
  ctx = ensureSheetContext(ctx);

  const weekday = getWeekdayLabel_(dateTime);
  const currentMinutes = timeToMinutes_(Utilities.formatDate(
    dateTime, Session.getScriptTimeZone(), "HH:mm"
  ));
  const slots = getTrainingSlots(ctx).filter(row =>
    normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row)
  );

  return getBillingBlocks(ctx).filter(block =>
    normalizeId_(block["location_id"]) === locationId &&
    isActiveMasterRow_(block) &&
    weekdayMatches_(block["曜日"], weekday)
  ).map(block => {
    const blockId = normalizeId_(block["billing_block_id"]);
    const blockSlots = slots.filter(slot => normalizeId_(slot["billing_block_id"]) === blockId);
    if (blockSlots.length === 0) return null;
    const start = Math.min.apply(null, blockSlots.map(slot => timeToMinutes_(slot["開始時刻"])));
    const end = Math.max.apply(null, blockSlots.map(slot => timeToMinutes_(slot["終了時刻"])));
    if (!isFinite(start) || !isFinite(end)) return null;
    return {
      billing_block_id: blockId,
      label: String(block["表示名"] || blockId),
      start_time: minutesToTimeText_(start),
      end_time: minutesToTimeText_(end),
      is_current: currentMinutes >= start && currentMinutes <= end,
      is_nearby: currentMinutes >= start - 30 && currentMinutes <= end + 30
    };
  }).filter(Boolean).sort((a, b) => timeToMinutes_(a.start_time) - timeToMinutes_(b.start_time));
}

//------------------------------------------------------------------------------------------------
// doGet() で呼び出すと、JSONP形式で出席登録APIを呼び出せる。
function getMemberAttendanceState(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const memberId = normalizeId_(params.member_id);
  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);
  const attendanceDate = parseAttendanceDate_(params.attendance_date, ctx);

  if (!memberId || !locationId || !billingBlockId) {
    return { ok: false, message: "会員・道場・課金枠を指定してください。" };
  }
  const member = getMembers(ctx).find(row =>
    normalizeId_(row["member_id"]) === memberId && isActiveMasterRow_(row)
  );
  if (!member) return { ok: false, message: "有効な会員が見つかりません。" };

  validateAttendanceScope_(locationId, billingBlockId, ctx);
  const rows = getActiveAttendanceRowsForScope(
    attendanceDate, memberId, locationId, billingBlockId, ctx
  );

  return {
    ok: true,
    member_id: memberId,
    selected_slot_ids: Array.from(new Set(rows.map(row => normalizeId_(row["slot_id"])).filter(Boolean)))
  };
}

//------------------------------------------------------------------------------------------------
// doPost() で呼び出すと、JSONP形式で出席登録APIを呼び出せる。
function registerAttendanceBatch(data, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ctx = ensureSheetContext(ctx || createSheetContext());
    return registerAttendanceBatchLocked_(data || {}, ctx);

  } finally {
    lock.releaseLock();
  }
}


function registerAttendanceBatchLocked_(data, ctx) {
  ctx = ensureSheetContext(ctx);

  const teacherId = normalizeId_(data.teacher_id);
  const locationId = normalizeId_(data.location_id);
  const billingBlockId = normalizeId_(data.billing_block_id);

  return attendanceCore_registerBatch_({
    teacher_id: teacherId,
    location_id: locationId,
    billing_block_id: billingBlockId,
    attendance_session_id: data.attendance_session_id,
    attendance_items: data.attendance_items,
    source: data.source || ATTENDANCE_SOURCE_QR,
    require_teacher: true,
    initial_status: "有効",
    sync_unselected: true,
    allow_duplicate_members: false,
    remarks: "",
    cancel_reason: "出席確認画面との同期による選択解除",
    message: ""
  }, ctx);
}

function validateAttendanceMasterData_(teacherId, locationId, billingBlockId, ctx) {
  ctx = ensureSheetContext(ctx);
  
  const teacher = getTeachers(ctx).find(row =>
    normalizeId_(row["teacher_id"]) === teacherId && isActiveMasterRow_(row)
  );
  if (!teacher) throw new Error("有効な先生が見つかりません。");
  if (!isTrueValue_(teacher["出席受付可"])) throw new Error("この先生は出席受付不可です。");

  validateAttendanceScope_(locationId, billingBlockId, ctx);
}

function validateAttendanceScope_(locationId, billingBlockId, ctx) {
  ctx = ensureSheetContext(ctx);

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

    const dateText = formatAttendanceDate_(row["稽古日"], ctx);
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

function parseAttendanceDate_(value, ctx) {
  ctx = ensureSheetContext(ctx);

  if (!value) return sup_now(ctx);
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

function formatAttendanceDate_(value, ctx) {
  ctx = ensureSheetContext(ctx);

  if (value === "" || value == null) return "";
  const date = value instanceof Date ? value : parseAttendanceDate_(value, ctx);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function formatTimeValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }
  return String(value == null ? "" : value).trim();
}

function timeToMinutes_(value) {
  const text = formatTimeValue_(value);
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTimeText_(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function parseSessionDateTime_(value, ctx) {
  if (!value) return sup_now(ctx);
  const date = new Date(value);
  if (isNaN(date.getTime())) throw new Error("課金枠判定日時が不正です。");
  return date;
}

function getWeekdayLabel_(date) {
  const dayNumber = Number(Utilities.formatDate(
    date, Session.getScriptTimeZone(), "u"
  ));
  return ["", "月", "火", "水", "木", "金", "土", "日"][dayNumber] || "";
}

function weekdayMatches_(masterValue, weekdayLabel) {
  const value = normalizeId_(masterValue).replace(/曜日/g, "");
  return value === weekdayLabel || value.indexOf(weekdayLabel) >= 0;
}

function makeAttendanceKey_(dateText, memberId, slotId) {
  return [dateText, normalizeId_(memberId), normalizeId_(slotId)].join("|");
}
