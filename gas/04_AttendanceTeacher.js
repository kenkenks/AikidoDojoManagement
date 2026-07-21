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

function attendanceTeacherGetTodayOverview(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);
  const attendanceDate = parseAttendanceDate_(params.attendance_date, ctx);
  if (!locationId) return { ok: false, message: "道場を指定してください。" };

  const rows = attendanceCore_findRowsForScope_({
    attendance_date: attendanceDate,
    location_id: locationId,
    billing_block_id: billingBlockId
  }, ctx);

  const grouped = {};
  rows.forEach(function(row) {
    const memberId = normalizeId_(row["member_id"]);
    if (!memberId) return;
    if (!grouped[memberId]) {
      grouped[memberId] = { slot_ids: {}, statuses: {} };
    }
    const slotId = normalizeId_(row["slot_id"]);
    const status = String(row["状態"] || "").trim();
    if (slotId) grouped[memberId].slot_ids[slotId] = true;
    if (status) grouped[memberId].statuses[status] = true;
  });

  const memberIds = Object.keys(grouped);
  const summaries = attendanceProgress_getMemberSummaries(memberIds, ctx);
  const attendanceItems = memberIds.map(function(memberId) {
    const progress = summaries[memberId] || {};
    return {
      member_id: memberId,
      member_name: progress.member_name || memberId,
      current_rank: progress.current_rank || "",
      rank_sort_order: Number(progress.rank_sort_order || 999999),
      next_rank: progress.next_rank || "",
      training_count: Number(progress.training_count || 0),
      required_training_count: Number(progress.required_training_count || 0),
      required_training_count_source: progress.required_training_count_source || "未設定",
      remaining_training_count: progress.remaining_training_count === null || progress.remaining_training_count === undefined
        ? null
        : Number(progress.remaining_training_count),
      examination_ready: progress.examination_ready === true,
      slot_ids: Object.keys(grouped[memberId].slot_ids),
      statuses: Object.keys(grouped[memberId].statuses)
    };
  });

  return {
    ok: true,
    attendance_date: formatAttendanceDate_(attendanceDate, ctx),
    location_id: locationId,
    billing_block_id: billingBlockId,
    member_count: attendanceItems.length,
    attendance_items: attendanceItems
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
