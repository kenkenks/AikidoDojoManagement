// ========================================
// sup_runner_Attendance.js
// TASK-DEV-011-100
// 出席 Story Runner Ver1.0
// ========================================
//
// TYPE: RUNNER
// STATUS: 作成中
// TASK: TASK-DEV-011-100
// AREA: ATTENDANCE
//
// TAG: RUNNER
// TAG: ATTENDANCE
// TAG: STORY
// TAG: RDD
// TAG: STORY-001
//

function runner_story_attendance_001() {
  const story = "STORY-001";
  const task = "TASK-DEV-011-100-001";
  const startedAt = Date.now();

  const ctx = createSheetContext();

  const locationId = "HONBU";
  const billingBlockId = "B_KYO_MON_1030_1230";
  const teacherId = "T001";

  const members = [
    "M001", "M002", "M003", "M004", "M005",
    "M006", "M007", "M008", "M009", "M010"
  ];

  const slotIds = [
    "KYO_MON_1030",
    "KYO_MON_1130"
  ];

  const results = [];

  results.push(runner_story_prepare_({
    story: story,
    location_id: locationId,
    billing_block_id: billingBlockId
  }, ctx));

  results.push(runner_attendance_step_(
    story,
    "Step01",
    "出席受付QRシート（道場）を設置する",
    function() {
      return {
        ok: true,
        skipped: true,
        message: "QRシート設置は運用前提のためRunner対象外。"
      };
    }
  ));

  results.push(runner_attendance_step_(
    story,
    "Step03",
    "出席受付QRシート（道場）を読み取る",
    function() {
      return getAttendanceSessionInfo({
        location_id: locationId,
        billing_block_id: billingBlockId
      }, ctx);
    }
  ));

  results.push(runner_attendance_step_(
    story,
    "Step04",
    "会員がセルフ出席登録を行う",
    function() {
      return attendanceMemberRegisterBatch({
        location_id: locationId,
        billing_block_id: billingBlockId,
        attendance_items: members.map(function(memberId) {
          return {
            member_id: memberId,
            slot_ids: slotIds
          };
        }),
        source: "runner_story_attendance_001"
      }, ctx);
    }
  ));

  results.push(runner_attendance_step_(
    story,
    "Step05",
    "会員が出席登録完了を確認する",
    function() {
      return attendanceGetMemberRegistrationState({
        member_id: "M001",
        location_id: locationId,
        billing_block_id: billingBlockId
      }, ctx);
    }
  ));

  results.push(runner_attendance_step_(
    story,
    "Step06",
    "先生が出席者一覧を確認する",
    function() {
      return attendanceTeacherListPending({
        location_id: locationId,
        billing_block_id: billingBlockId,
        status: "確認待ち"
      }, ctx);
    }
  ));

  results.push(runner_attendance_step_(
    story,
    "Step06",
    "先生が確認ボタンを押す",
    function() {
      return attendanceTeacherConfirm({
        teacher_id: teacherId,
        location_id: locationId,
        billing_block_id: billingBlockId,
        member_ids: members
      }, ctx);
    }
  ));

  results.push(runner_attendance_step_(
    story,
    "Verify",
    "確認済み状態を検証する",
    function() {
      return runner_story_attendance_001_verify_({
        location_id: locationId,
        billing_block_id: billingBlockId,
        teacher_id: teacherId,
        member_ids: members,
        slot_ids: slotIds
      }, ctx);
    }
  ));

  const summary = runner_story_summary_(story, task, results, startedAt);

  Logger.log(JSON.stringify(summary, null, 2));

  return {
    ok: summary.ok,
    story: story,
    task: task,
    name: "通常出席 Story Runner",
    summary: summary,
    results: results
  };
}

// ========================================
// Prepare
// ========================================

function runner_story_prepare_(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const story = params.story || "";
  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);
  const attendanceDate = sup_today(ctx);

  const cleared = runner_story_clearAttendance_({
    attendance_date: attendanceDate,
    location_id: locationId,
    billing_block_id: billingBlockId
  }, ctx);

  return {
    ok: true,
    story: story,
    step: "Prepare",
    title: "Runner初期化",
    result: {
      ok: true,
      attendance_date: formatAttendanceDate_(attendanceDate, ctx),
      location_id: locationId,
      billing_block_id: billingBlockId,
      cleared_count: cleared.cleared_count,
      message: "Story対象の出席ログを初期化しました。"
    }
  };
}

function runner_story_clearAttendance_(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = getRequiredSheet_("07_出席ログ", ctx);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return {
      ok: true,
      cleared_count: 0
    };
  }

  const headers = values[0].map(function(header) {
    return String(header).trim();
  });

  const dateCol = headers.indexOf("稽古日");
  const locationCol = headers.indexOf("location_id");
  const billingBlockCol = headers.indexOf("billing_block_id");

  if (dateCol < 0 || locationCol < 0 || billingBlockCol < 0) {
    throw new Error("07_出席ログ に必要な列がありません。");
  }

  const targetDate = formatAttendanceDate_(params.attendance_date, ctx);
  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);

  const deleteRows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const rowDate = formatAttendanceDate_(row[dateCol], ctx);
    const rowLocationId = normalizeId_(row[locationCol]);
    const rowBillingBlockId = normalizeId_(row[billingBlockCol]);

    if (
      rowDate === targetDate &&
      rowLocationId === locationId &&
      rowBillingBlockId === billingBlockId
    ) {
      deleteRows.push(i + 1);
    }
  }

  for (let i = deleteRows.length - 1; i >= 0; i--) {
    sheet.deleteRow(deleteRows[i]);
  }

  invalidateAttendances(ctx);

  return {
    ok: true,
    cleared_count: deleteRows.length
  };
}

// ========================================
// Step wrapper
// ========================================

function runner_attendance_step_(story, step, title, callback) {
  const startedAt = Date.now();

  try {
    const result = callback();

    return {
      ok: result && result.ok !== false,
      story: story,
      step: step,
      title: title,
      elapsed_ms: Date.now() - startedAt,
      result: result
    };

  } catch (e) {
    return {
      ok: false,
      story: story,
      step: step,
      title: title,
      elapsed_ms: Date.now() - startedAt,
      message: e.message || String(e),
      stack: e.stack || ""
    };
  }
}

// ========================================
// Verify
// ========================================

function runner_story_attendance_001_verify_(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);
  const teacherId = normalizeId_(params.teacher_id);
  const memberIds = params.member_ids || [];
  const slotIds = params.slot_ids || [];

  const rows = attendanceFindRowsForScope_({
    attendance_date: sup_today(ctx),
    location_id: locationId,
    billing_block_id: billingBlockId
  }, ctx);

  const expectedCount = memberIds.length * slotIds.length;

  const confirmedRows = rows.filter(function(row) {
    return normalizeId_(row["状態"]) === "確認済";
  });

  const teacherRows = confirmedRows.filter(function(row) {
    return normalizeId_(row["teacher_id"]) === teacherId;
  });

  const errors = [];

  if (rows.length !== expectedCount) {
    errors.push("出席ログ件数が期待値と一致しません。 expected=" + expectedCount + " actual=" + rows.length);
  }

  if (confirmedRows.length !== expectedCount) {
    errors.push("確認済み件数が期待値と一致しません。 expected=" + expectedCount + " actual=" + confirmedRows.length);
  }

  if (teacherRows.length !== expectedCount) {
    errors.push("teacher_id 登録件数が期待値と一致しません。 expected=" + expectedCount + " actual=" + teacherRows.length);
  }

  return {
    ok: errors.length === 0,
    expected_count: expectedCount,
    actual_count: rows.length,
    confirmed_count: confirmedRows.length,
    teacher_confirmed_count: teacherRows.length,
    errors: errors,
    message: errors.length === 0
      ? "STORY-001 の確認済み状態を検証しました。"
      : "STORY-001 の検証で不一致があります。"
  };
}

// ========================================
// Summary
// ========================================

function runner_story_summary_(story, task, results, startedAt) {
  const total = results.length;

  const success = results.filter(function(result) {
    return result.ok === true;
  }).length;

  const next = results.filter(function(result) {
    return result.result && result.result.type === "NEXT";
  }).length;

  const failed = results.filter(function(result) {
    return result.ok === false &&
      (!result.result || result.result.type !== "NEXT");
  }).length;

  return {
    ok: failed === 0 && next === 0,
    story: story,
    task: task,
    total: total,
    success: success,
    failed: failed,
    next: next,
    elapsed_ms: Date.now() - startedAt,
    steps: results.map(function(result) {
      return {
        ok: result.ok,
        step: result.step,
        title: result.title,
        elapsed_ms: result.elapsed_ms || 0,
        type: result.result && result.result.type ? result.result.type : "",
        message:
          result.message ||
          (result.result && result.result.message) ||
          ""
      };
    })
  };
}

// ========================================
// NEXT
// ========================================

function runner_attendance_next_(params) {
  return {
    ok: false,
    type: "NEXT",
    story: params.story,
    step: params.step,
    task: params.task,
    function: params.functionName,
    status: "NOT_IMPLEMENTED",
    message: params.functionName + " is not implemented.",
    note: params.note || ""
  };
}