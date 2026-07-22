// 出席枠同期をブラウザ抜きで確認する診断Runner。
// STORY-902が作成したM001の2枠を1枠へ同期し、最後に2枠へ復元する。

function runner_diagnostic_attendance_slot_sync_902() {
  const ctx = createSheetContext();
  ctx.settings = Object.assign({}, ctx.settings || {}, {
    TIME_TRAVEL_ENABLED: "TRUE",
    DEBUG_DATE: "2099-07-02T10:20:00+09:00",
    DEBUG_TARGET_MONTH: "2099-07"
  });
  const scope = {
    attendance_date: "2099-07-02",
    member_id: "M001",
    location_id: "HONBU",
    billing_block_id: "B_KYO_MON_1030_1230",
    teacher_id: "T001"
  };
  const initial = diagnosticAttendance_activeSlots_(scope, ctx);
  const before = getTrainingSlots(ctx).filter(function(row) {
    return isActiveMasterRow_(row) &&
      normalizeId_(row["location_id"]) === scope.location_id &&
      normalizeId_(row["billing_block_id"]) === scope.billing_block_id;
  }).map(function(row) { return normalizeId_(row["slot_id"]); }).filter(Boolean).sort().slice(0, 2);
  if (before.length !== 2) {
    const result = { ok:false, phase:"Preflight", expected:"有効な稽古枠マスタ2件", actual:before, message:"診断対象の稽古枠マスタが2枠ではありません。" };
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }
  const rank = String((getMembers(ctx).find(function(row) {
    return normalizeId_(row["member_id"]) === scope.member_id;
  }) || {})["現在級段位"] || "").trim();

  const normalizeResult = registerAttendanceBatchLocked_({
    teacher_id: scope.teacher_id,
    location_id: scope.location_id,
    billing_block_id: scope.billing_block_id,
    attendance_date: scope.attendance_date,
    attendance_session_id: "DIAG-ATT-SLOT-NORMALIZE-20990702",
    attendance_items: [{ member_id:scope.member_id, current_rank:rank, slot_ids:before }],
    source: "runner_diagnostic_attendance_slot_sync_902"
  }, ctx);
  const normalized = diagnosticAttendance_activeSlots_(scope, ctx);
  const normalizeCheck = {
    ok: normalizeResult && normalizeResult.ok === true && diagnosticAttendance_sameSlots_(normalized, before),
    service_result:normalizeResult,
    active_slots:normalized
  };

  const reduceResult = registerAttendanceBatchLocked_({
    teacher_id: scope.teacher_id,
    location_id: scope.location_id,
    billing_block_id: scope.billing_block_id,
    attendance_date: scope.attendance_date,
    attendance_session_id: "DIAG-ATT-SLOT-REDUCE-20990702",
    attendance_items: [{ member_id:scope.member_id, current_rank:rank, slot_ids:[before[0]] }],
    source: "runner_diagnostic_attendance_slot_sync_902"
  }, ctx);
  const reduced = diagnosticAttendance_activeSlots_(scope, ctx);
  const reduceCheck = {
    ok: reduceResult && reduceResult.ok === true && reduced.length === 1 && reduced[0] === before[0],
    service_result: reduceResult,
    active_slots: reduced
  };

  const restoreResult = registerAttendanceBatchLocked_({
    teacher_id: scope.teacher_id,
    location_id: scope.location_id,
    billing_block_id: scope.billing_block_id,
    attendance_date: scope.attendance_date,
    attendance_session_id: "DIAG-ATT-SLOT-RESTORE-20990702",
    attendance_items: [{ member_id:scope.member_id, current_rank:rank, slot_ids:before }],
    source: "runner_diagnostic_attendance_slot_sync_902"
  }, ctx);
  const restored = diagnosticAttendance_activeSlots_(scope, ctx);
  const restoreCheck = {
    ok: restoreResult && restoreResult.ok === true && diagnosticAttendance_sameSlots_(restored, before),
    service_result: restoreResult,
    active_slots: restored
  };
  const result = {
    ok: normalizeCheck.ok && reduceCheck.ok && restoreCheck.ok,
    diagnostic:"ATTENDANCE_SLOT_SYNC_902",
    initial_slots:initial,
    before_slots:before,
    normalize:normalizeCheck,
    reduce:reduceCheck,
    restore:restoreCheck,
    message:normalizeCheck.ok && reduceCheck.ok && restoreCheck.ok ? "出席Coreの正規化→1枠→2枠がPASSしました。" : "出席Coreの枠同期に失敗しました。"
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function diagnosticAttendance_activeSlots_(scope, ctx) {
  return getActiveAttendanceRowsForScope(
    scope.attendance_date,
    scope.member_id,
    scope.location_id,
    scope.billing_block_id,
    ctx
  ).map(function(row) { return normalizeId_(row["slot_id"]); }).filter(Boolean).sort();
}

function diagnosticAttendance_sameSlots_(left, right) {
  return left.length === right.length && left.every(function(value, index) {
    return value === right.slice().sort()[index];
  });
}
