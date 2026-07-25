// ========================================
// 15_SessionStoryRunner.gs
// Session Story GAS Runner
// ========================================
//
// TYPE: RUNNER
// AREA: SESSION
// TAG: RUNNER
// TAG: STORY
// TAG: SESSION
// TAG: STORY-SESSION-001
//
// Browser側の仮想SessionはsessionStorageで動作するため、GASから直接操作しない。
// このRunnerは、BrowserがSession Contextから引き渡す同一スコープを使い、
// Attendance -> Payment -> PaymentStatus のGAS/WebConnect連携を検証する。

function runner_story_session_001() {
  const startedAt = Date.now();
  const story = "STORY-SESSION-001";
  const task = "TASK-FWK-022";
  const scope = {
    teacher_id: "T001",
    location_id: "HONBU",
    billing_block_id: "B_KYO_MON_1030_1230"
  };
  const steps = [];

  sessionStory001_runStep_(steps, "Preflight", "Session Contextの参照先マスタを確認する", function() {
    const ctx = createSheetContext();
    const teacher = getTeachers(ctx).find(function(row) {
      return normalizeId_(row["teacher_id"]) === scope.teacher_id && isActiveMasterRow_(row);
    });
    const location = getLocations(ctx).find(function(row) {
      return normalizeId_(row["location_id"]) === scope.location_id && isActiveMasterRow_(row);
    });
    const block = getBillingBlocks(ctx).find(function(row) {
      return normalizeId_(row["billing_block_id"]) === scope.billing_block_id &&
        normalizeId_(row["location_id"]) === scope.location_id &&
        isActiveMasterRow_(row);
    });

    const missing = [];
    if (!teacher) missing.push("teacher_id=" + scope.teacher_id);
    if (!location) missing.push("location_id=" + scope.location_id);
    if (!block) missing.push("billing_block_id=" + scope.billing_block_id);

    return {
      ok: missing.length === 0,
      scope: scope,
      missing: missing,
      message: missing.length === 0
        ? "Session Contextの参照先マスタを確認しました。"
        : "Session Contextの参照先マスタが不足しています: " + missing.join(", ")
    };
  });

  sessionStory001_runStep_(steps, "Attendance", "Attendance APIがSession Contextを受け取る", function() {
    const result = sessionStory001_callGet_({
      action: "attendance_session_info",
      teacher_id: scope.teacher_id,
      location_id: scope.location_id,
      billing_block_id: scope.billing_block_id
    });

    const ok = result.ok === true &&
      normalizeId_(result.location_id) === scope.location_id &&
      normalizeId_(result.billing_block_id) === scope.billing_block_id;

    return {
      ok: ok,
      scope: scope,
      response: result,
      message: ok
        ? "Attendance APIが同一Session Contextで受付範囲を解決しました。"
        : "Attendance APIの受付範囲がSession Contextと一致しません。"
    };
  });

  sessionStory001_runStep_(steps, "Payment", "Payment APIが同じ道場・課金枠を受け取る", function() {
    const result = sessionStory001_callGet_({
      action: "payment_reception_summary",
      teacher_id: scope.teacher_id,
      location_id: scope.location_id,
      billing_block_id: scope.billing_block_id
    });

    const ok = result.ok === true &&
      normalizeId_(result.location_id) === scope.location_id &&
      normalizeId_(result.billing_block_id) === scope.billing_block_id;

    return {
      ok: ok,
      scope: scope,
      response: result,
      message: ok
        ? "Payment APIがAttendanceと同じ受付範囲を使用しました。"
        : "Payment APIの受付範囲がSession Contextと一致しません。"
    };
  });

  sessionStory001_runStep_(steps, "PaymentStatus", "PaymentStatus APIを同一ストーリーで取得する", function() {
    const result = sessionStory001_callGet_({
      action: "teacher_payment_status",
      teacher_id: scope.teacher_id,
      location_id: scope.location_id,
      billing_block_id: scope.billing_block_id
    });

    const ok = result.ok === true && result.summary && Array.isArray(result.members);

    return {
      ok: ok,
      scope: scope,
      response_summary: result.summary || null,
      member_count: Array.isArray(result.members) ? result.members.length : 0,
      message: ok
        ? "PaymentStatus APIの取得を確認しました。"
        : "PaymentStatus APIの取得に失敗しました。"
    };
  });

  sessionStory001_runStep_(steps, "Boundary", "Browser Sessionとの責任境界を確認する", function() {
    return {
      ok: true,
      browser_runner: "work/runner-story-session-001.mjs",
      gas_runner: "runner_story_session_001",
      browser_responsibility: "login / context persistence / subject switch / logout",
      gas_responsibility: "Attendance / Payment / PaymentStatus API",
      message: "Browser SessionとGAS処理の責任境界を確認しました。"
    };
  });

  const failed = steps.filter(function(step) { return !step.ok; }).length;
  const summary = {
    ok: failed === 0,
    story: story,
    task: task,
    runner_mode: "GAS_WEB_CONNECT",
    total: steps.length,
    success: steps.length - failed,
    failed: failed,
    elapsed_ms: Date.now() - startedAt,
    scope: scope,
    steps: steps,
    message: failed === 0 ? story + " PASS" : story + " FAIL"
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

function sessionStory001_runStep_(steps, step, title, fn) {
  const startedAt = Date.now();
  try {
    const result = fn() || {};
    steps.push({
      ok: result.ok !== false,
      step: step,
      title: title,
      elapsed_ms: Date.now() - startedAt,
      message: result.message || "",
      result: result
    });
  } catch (e) {
    steps.push({
      ok: false,
      step: step,
      title: title,
      elapsed_ms: Date.now() - startedAt,
      message: e.message,
      result: {
        ok: false,
        message: e.message,
        stack: e.stack || ""
      }
    });
  }
}

function sessionStory001_callGet_(parameter) {
  const output = doGet({ parameter: parameter || {} });
  const content = output && typeof output.getContent === "function"
    ? output.getContent()
    : String(output || "");

  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error("WebConnect応答をJSONとして解析できません: " + content);
  }
}
