// ========================================
// 04_AttendanceTeacher.js
// 先生側 出席操作
// ========================================
//
// TYPE: SERVICE
// AREA: ATTENDANCE
// TAG: ATTENDANCE
// TAG: TEACHER
// TAG: STORY-001
//

function attendanceTeacherListPending(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);
  const attendanceDate = parseAttendanceDate_(params.attendance_date, ctx);

  if (!locationId || !billingBlockId) {
    return { ok: false, message: "道場・課金枠を指定してください。" };
  }

  const rows = attendanceCore_findRowsForScope_({
    attendance_date: attendanceDate,
    location_id: locationId,
    billing_block_id: billingBlockId,
    status: "確認待ち"
  }, ctx);

  return {
    ok: true,
    location_id: locationId,
    billing_block_id: billingBlockId,
    status: "確認待ち",
    count: rows.length,
    attendance_items: rows.map(function(row) {
      return {
        attendance_id: normalizeId_(row["attendance_id"]),
        member_id: normalizeId_(row["member_id"]),
        slot_id: normalizeId_(row["slot_id"]),
        teacher_id: normalizeId_(row["teacher_id"]),
        status: normalizeId_(row["状態"])
      };
    })
  };
}

function attendanceTeacherConfirm(params, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ctx = ensureSheetContext(ctx || createSheetContext());

    const teacherId = normalizeId_(params.teacher_id);
    const locationId = normalizeId_(params.location_id);
    const billingBlockId = normalizeId_(params.billing_block_id);
    const memberIds = Array.isArray(params.member_ids)
      ? params.member_ids.map(normalizeId_).filter(Boolean)
      : [];
    const attendanceDate = parseAttendanceDate_(params.attendance_date, ctx);

    if (!teacherId || !locationId || !billingBlockId) {
      return { ok: false, message: "先生・道場・課金枠を指定してください。" };
    }

    validateAttendanceMasterData_(teacherId, locationId, billingBlockId, ctx);

    const targets = attendanceCore_findRowsForScope_({
      attendance_date: attendanceDate,
      location_id: locationId,
      billing_block_id: billingBlockId,
      status: "確認待ち"
    }, ctx).filter(function(row) {
      if (memberIds.length === 0) return true;
      return memberIds.indexOf(normalizeId_(row["member_id"])) >= 0;
    });

    if (targets.length === 0) {
      return {
        ok: true,
        confirmed_count: 0,
        message: "確認待ちの出席はありません。"
      };
    }

    attendanceCore_updateRows_(targets, {
      teacher_id: teacherId,
      "状態": "確認済",
      "備考": "先生確認済"
    }, ctx);

    return {
      ok: true,
      confirmed_count: targets.length,
      teacher_id: teacherId,
      message: "出席を確認済みにしました。"
    };

  } finally {
    lock.releaseLock();
  }
}