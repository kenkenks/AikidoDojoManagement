// ========================================
// 04_AttendanceMember.js
// 会員側 出席登録
// ========================================
//
// TYPE: SERVICE
// AREA: ATTENDANCE
// TAG: ATTENDANCE
// TAG: MEMBER
// TAG: STORY-001
//

function attendanceMemberRegisterBatch(data, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ctx = ensureSheetContext(ctx || createSheetContext());

    return attendanceCore_registerBatch_({
      location_id: data.location_id,
      billing_block_id: data.billing_block_id,
      attendance_session_id: data.attendance_session_id,
      attendance_items: data.attendance_items,
      source: data.source || "member_attendance",
      require_teacher: false,
      teacher_id: "",
      initial_status: "確認待ち",
      sync_unselected: false,
      allow_duplicate_members: false,
      remarks: "会員セルフ出席登録",
      message: "セルフ出席登録を受け付けました。先生確認待ちです。"
    }, ctx);

  } finally {
    lock.releaseLock();
  }
}

function attendanceMemberGetRegistrationState(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const memberId = normalizeId_(params.member_id);
  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);
  const attendanceDate = parseAttendanceDate_(params.attendance_date, ctx);

  if (!memberId || !locationId || !billingBlockId) {
    return { ok: false, message: "会員・道場・課金枠を指定してください。" };
  }

  const rows = attendanceCore_findRowsForScope_({
    attendance_date: attendanceDate,
    member_id: memberId,
    location_id: locationId,
    billing_block_id: billingBlockId
  }, ctx);

  return {
    ok: true,
    member_id: memberId,
    location_id: locationId,
    billing_block_id: billingBlockId,
    selected_slot_ids: Array.from(new Set(rows.map(function(row) {
      return normalizeId_(row["slot_id"]);
    }).filter(Boolean))),
    statuses: Array.from(new Set(rows.map(function(row) {
      return normalizeId_(row["状態"]);
    }).filter(Boolean))),
    pending_count: rows.filter(function(row) {
      return normalizeId_(row["状態"]) === "確認待ち";
    }).length,
    confirmed_count: rows.filter(function(row) {
      return normalizeId_(row["状態"]) === "確認済";
    }).length,
    message: rows.length > 0
      ? "出席登録済みです。"
      : "出席登録はありません。"
  };
}

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