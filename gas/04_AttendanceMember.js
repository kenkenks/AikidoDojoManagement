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

/**
 * AttendanceMemberRegisterJob
 *
 * 会員自身によるセルフ出席登録を受け付ける Job。
 * 先生確認は別の仕事としてここへ含めない。
 */
class AttendanceMemberRegisterJob extends Job {
  constructor(ctx) {
    super();
    this.ctx = ctx;
  }

  execute(data) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      this.ctx = ensureSheetContext(this.ctx || createSheetContext());

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
      }, this.ctx);

    } finally {
      lock.releaseLock();
    }
  }
}

// 既存の公開入口は Facade として維持する。
function attendanceMemberRegisterBatch(data, ctx) {
  return new AttendanceMemberRegisterJob(ctx).execute(data);
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
