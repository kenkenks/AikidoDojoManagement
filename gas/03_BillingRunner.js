// ========================================
// 03_BillingRunner.js
// Billing Story Runner
// ========================================
//
// TYPE: RUNNER
// AREA: BILLING
// TAG: BILLING
// TAG: RUNNER
// TAG: STORY-B001
//

function runner_billing_story_001() {
  const startedAt = Date.now();
  const ctx = createSheetContext();

  const story = "STORY-B001";
  const task = "TASK-DEV-013";
  const steps = [];

  const samples = [
    { memberId: "M001", plan_id: "P001", expected: "REGISTERED" },
    { memberId: "M002", plan_id: "P002", expected: "REGISTERED" },
    { memberId: "M003", plan_id: "P007", expected: "EXEMPT" },
    { memberId: "M004", plan_id: "P011", expected: "REGISTERED" },
    { memberId: "M005", plan_id: "P012", expected: "REGISTERED" },

    // 家族同一請求グループのため、代表登録後は登録済みが正しい
    { memberId: "M006", plan_id: "P013", expected: "ALREADY_REGISTERED" },
    { memberId: "M007", plan_id: "P020", expected: "ALREADY_REGISTERED" },

    { memberId: "M008", plan_id: "P021", expected: "EXEMPT" }
  ];

  function runStep(step, title, fn) {
    const t0 = Date.now();

    try {
      const result = fn();

      steps.push({
        ok: result && result.ok !== false,
        step: step,
        title: title,
        elapsed_ms: Date.now() - t0,
        message: result && result.message ? result.message : "",
        result: result
      });

    } catch (e) {
      steps.push({
        ok: false,
        step: step,
        title: title,
        elapsed_ms: Date.now() - t0,
        message: e.message,
        result: {
          ok: false,
          message: e.message
        }
      });
    }
  }

  runStep("Prepare", "Billing Runner初期化", function() {
    return {
      ok: true,
      message: "Billing Runnerを初期化しました。"
    };
  });

  runStep("Step01", "月額請求登録を実行する", function() {
    const results = samples.map(function(sample) {
      const actual = billingMonthlyAccept(
        sample.memberId,
        sample.plan_id,
        ctx
      );

      const judgment = billingRunnerJudgeResult_(actual, sample.expected);

      return {
        member_id: sample.memberId,
        plan_id: sample.plan_id,
        expected: sample.expected,
        ok: judgment.ok,
        actual_ok: actual && actual.ok !== false,
        actual_message: actual && actual.message ? actual.message : "",
        invoice_id: actual && actual.invoice ? actual.invoice.invoice_id : "",
        amount: actual && actual.invoice ? Number(actual.invoice["金額"] || 0) : 0,
        status: actual && actual.invoice ? String(actual.invoice["支払状態"] || "") : "",
        judgment_message: judgment.message
      };
    });

    return {
      ok: results.every(function(r) { return r.ok; }),
      count: results.length,
      success: results.filter(function(r) { return r.ok; }).length,
      failed: results.filter(function(r) { return !r.ok; }).length,
      results: results,
      message: "月額請求登録を実行しました。"
    };
  });

  runStep("Verify", "請求明細状態を検証する", function() {
    const invoices = getInvoices(ctx);
    const targetMonth = sup_targetMonth(ctx);

    const targetInvoices = invoices.filter(function(invoice) {
      return normalizeMonth(invoice["target_month"]) === normalizeMonth(targetMonth);
    });

    const invalid = targetInvoices.filter(function(invoice) {
      const amount = Number(invoice["金額"] || 0);
      const status = String(invoice["支払状態"] || "");

      if (amount === 0 && status !== "免除") return true;
      if (amount > 0 && status !== "未払い") return true;

      return false;
    });

    return {
      ok: invalid.length === 0,
      target_month: normalizeMonth(targetMonth),
      invoice_count: targetInvoices.length,
      invalid_count: invalid.length,
      invalid: invalid,
      message: invalid.length === 0
        ? "請求明細状態を検証しました。"
        : "請求明細状態に不整合があります。"
    };
  });

  const success = steps.filter(function(step) { return step.ok; }).length;
  const failed = steps.filter(function(step) { return !step.ok; }).length;

  const summary = {
    ok: failed === 0,
    story: story,
    task: task,
    total: steps.length,
    success: success,
    failed: failed,
    elapsed_ms: Date.now() - startedAt,
    steps: steps.map(function(step) {
      return {
        ok: step.ok,
        step: step.step,
        title: step.title,
        elapsed_ms: step.elapsed_ms,
        message: step.message,
        result: step.result || null
      };
    })
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

/**
 * ROLE
 * BillingRunner / Judge
 *
 * RESPONSIBILITY
 * 実行結果 actual が期待結果 expected と一致しているかを判定する。
 *
 * NOTE
 * Runnerでは「関数が成功したか」ではなく、
 * 「Story上の期待結果と一致したか」をokとする。
 */
function billingRunnerJudgeResult_(actual, expected) {
  const message = String(actual && actual.message || "");
  const amount = actual && actual.invoice ? Number(actual.invoice["金額"] || 0) : 0;
  const status = actual && actual.invoice ? String(actual.invoice["支払状態"] || "") : "";

  if (expected === "REGISTERED") {
    return {
      ok: actual && actual.ok !== false && amount > 0 && status === "未払い",
      message: "1円以上の請求が未払いとして登録されること。"
    };
  }

  if (expected === "EXEMPT") {
    return {
      ok: actual && actual.ok !== false && amount === 0 && status === "免除",
      message: "0円請求が免除として登録されること。"
    };
  }

  if (expected === "ALREADY_REGISTERED") {
    return {
      ok: actual && actual.ok === false && message.indexOf("すでに登録済み") >= 0,
      message: "同一請求グループの重複登録が登録済みとして拒否されること。"
    };
  }

  return {
    ok: false,
    message: "未定義のexpectedです: " + expected
  };
}


// ========================================
// runner_billing_story_002
// 回数料金・上限制御確認
// ========================================
//
// STORY-B002
// TASK-DEV-016
//

function runner_billing_story_002() {
  const startedAt = Date.now();
  const ctx = createSheetContext();

  const story = "STORY-B002";
  const task = "TASK-DEV-016";
  const steps = [];

  function runStep(step, title, fn) {
    const t0 = Date.now();

    try {
      const result = fn();

      steps.push({
        ok: result && result.ok !== false,
        step: step,
        title: title,
        elapsed_ms: Date.now() - t0,
        message: result && result.message ? result.message : "",
        result: result
      });

    } catch (e) {
      steps.push({
        ok: false,
        step: step,
        title: title,
        elapsed_ms: Date.now() - t0,
        message: e.message,
        result: {
          ok: false,
          message: e.message
        }
      });
    }
  }

  runStep("Prepare", "回数料金確認用データを準備する", function() {
    return {
      ok: true,
      message: "Prepareは仮実装です。"
    };
  });

  runStep("Case01", "上限内の1回目請求を確認する", function() {
    const ctx2 = ctx;

    const invoice = billingCoreMakeInvoiceObject_(
      sup_targetMonth(ctx2),
      "G_RUNNER_B002",
      "M_RUNNER_B002",
      "P_RUNNER_USAGE",
      "回数料金",
      "回数料金テスト",
      1,
      1500,
      7500,
      ctx2
    );

    const amount = Number(invoice["金額"] || 0);
    const status = String(invoice["支払状態"] || "");

    return {
      ok: amount === 1500 && status === "未払い",
      invoice: invoice,
      amount: amount,
      status: status,
      message: amount === 1500 && status === "未払い"
        ? "上限内の1回目請求を確認しました。"
        : "上限内の1回目請求が期待値と異なります。"
    };
  });

  runStep("Case02", "上限内の追加請求を確認する", function() {
    const invoice = billingCoreMakeInvoiceObject_(
      sup_targetMonth(ctx),
      "G_RUNNER_B002",
      "M_RUNNER_B002",
      "P_RUNNER_USAGE",
      "回数料金",
      "回数料金テスト",
      3,
      1500,
      7500,
      ctx
    );

    const amount = Number(invoice["金額"] || 0);

    return {
      ok: amount === 4500 && invoice["支払状態"] === "未払い",
      invoice,
      message: "上限内の追加請求を確認しました。"
    };
  });

  runStep("Case03", "上限到達後に重複請求されないことを確認する", function() {
    const invoice = billingCoreMakeInvoiceObject_(
      sup_targetMonth(ctx),
      "G_RUNNER_B002",
      "M_RUNNER_B002",
      "P_RUNNER_USAGE",
      "回数料金",
      "回数料金テスト",
      10,
      1500,
      7500,
      ctx
    );

    const amount = Number(invoice["金額"] || 0);

    return {
      ok: amount === 7500 && invoice["支払状態"] === "未払い",
      invoice,
      message: "上限適用を確認しました。"
    };
  });

  runStep("Case04", "上限内の未払い分がPayment対象になることを確認する", function() {
    const invoice = billingCoreMakeInvoiceObject_(
      sup_targetMonth(ctx),
      "G_RUNNER_B002",
      "M_RUNNER_B002",
      "P_RUNNER_USAGE",
      "回数料金",
      "回数料金テスト",
      3,
      1500,
      7500,
      ctx
    );

    const amount = Number(invoice["請求予定額"] || invoice["金額"] || 0);
    const status = String(invoice["支払状態"] || "");

    const isPaymentTarget =
      status === "未払い" &&
      amount > 0;

    return {
      ok: isPaymentTarget,
      invoice: invoice,
      amount: amount,
      status: status,
      isPaymentTarget: isPaymentTarget,
      message: isPaymentTarget
        ? "上限内の未払い分がPayment対象になることを確認しました。"
        : "上限内の未払い分がPayment対象になりません。"
    };
  });

  const success = steps.filter(function(step) { return step.ok; }).length;
  const failed = steps.filter(function(step) { return !step.ok; }).length;

  const summary = {
    ok: failed === 0,
    story: story,
    task: task,
    total: steps.length,
    success: success,
    failed: failed,
    elapsed_ms: Date.now() - startedAt,
    steps: steps
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

// ========================================
// runner_billing_story_002_repeatAttendance
// P002: 反復出席 → 累積請求 → 上限、を本番の出席登録経路で確認する。
// 2099-08のトランザクションだけを使用する。
// ========================================
function runner_billing_story_002_repeatAttendance() {
  const ctx = createSheetContext();
  ctx.settings = {
    TIME_TRAVEL_ENABLED: "TRUE",
    DEBUG_DATE: "2099-08-01T09:00:00+09:00",
    DEBUG_TARGET_MONTH: "2099-08",
    DEBUG: "TRUE"
  };

  const targetMonth = "2099-08";
  const source = "runner_billing_story_002_repeatAttendance";
  const teacher = getTeachers(ctx).find(function(row) {
    return isActiveMasterRow_(row) && isTrueValue_(row["出席受付可"]);
  });
  const member = getMembers(ctx).find(function(row) {
    return isActiveMasterRow_(row) && normalizeId_(row["請求グループID"]);
  });
  const fee = getFees(ctx).find(function(row) {
    return isActiveMasterRow_(row) &&
      String(row["会費タイプ"] || "").trim() === "回数料金" &&
      Number(row["回数単価"] || 0) > 0;
  });

  let scope = null;
  getBillingBlocks(ctx).some(function(block) {
    if (!isActiveMasterRow_(block)) return false;
    const blockId = normalizeId_(block["billing_block_id"]);
    const locationId = normalizeId_(block["location_id"]);
    const slots = getTrainingSlots(ctx).filter(function(row) {
      return isActiveMasterRow_(row) &&
        normalizeId_(row["location_id"]) === locationId &&
        normalizeId_(row["billing_block_id"]) === blockId;
    });
    if (slots.length === 0) return false;
    scope = { location_id: locationId, billing_block_id: blockId, slot_ids: slots.slice(0, 2).map(function(row) {
      return normalizeId_(row["slot_id"]);
    }) };
    return true;
  });

  if (!teacher || !member || !fee || !scope) {
    const fail = { ok: false, story: "STORY-B002-REPEAT-ATTENDANCE", message: "Runnerに必要な有効マスタが不足しています。" };
    Logger.log(JSON.stringify(fail, null, 2));
    return fail;
  }

  const memberId = normalizeId_(member["member_id"]);
  const groupId = normalizeId_(member["請求グループID"]);
  const planId = normalizeId_(fee["plan_id"]);
  const unitPrice = Number(fee["回数単価"] || 0);
  const cap = Number(fee["上限金額"] || 0);

  // 2099-08のこの会員/請求グループだけ初期化。
  monthlyIntegration902_deleteRows_("07_出席ログ", function(row) {
    return normalizeMonth(row["target_month"]) === targetMonth && normalizeId_(row["member_id"]) === memberId &&
      normalizeId_(row["source"]) === source;
  }, ctx);
  monthlyIntegration902_deleteRows_("05_請求明細", function(row) {
    return normalizeMonth(row["target_month"]) === targetMonth && normalizeId_(row["billing_group_id"]) === groupId;
  }, ctx);
  monthlyIntegration902_deleteRows_("04_月次選択", function(row) {
    return normalizeMonth(row["target_month"]) === targetMonth && normalizeId_(row["billing_group_id"]) === groupId;
  }, ctx);
  monthlyIntegration902_deleteRows_("20_会費状態View", function(row) {
    return normalizeMonth(row["target_month"]) === targetMonth && normalizeId_(row["billing_group_id"]) === groupId;
  }, ctx);

  function setTime(iso) {
    ctx.settings.DEBUG_DATE = iso;
    ctx.settings.DEBUG_TARGET_MONTH = targetMonth;
  }
  function attend(day, session) {
    setTime(day + "T10:30:00+09:00");
    return registerAttendanceBatchLocked_({
      teacher_id: normalizeId_(teacher["teacher_id"]),
      location_id: scope.location_id,
      billing_block_id: scope.billing_block_id,
      attendance_date: day,
      attendance_session_id: session,
      attendance_items: [{
        member_id: memberId,
        plan_id: planId,
        slot_ids: scope.slot_ids
      }],
      source: source
    }, ctx);
  }
  function actualInvoice() {
    invalidateInvoices(ctx);
    return getInvoices(ctx).find(function(row) {
      return normalizeMonth(row["target_month"]) === targetMonth &&
        normalizeId_(row["billing_group_id"]) === groupId &&
        normalizeId_(row["plan_id"]) === planId;
    });
  }
  function assertAmount(label, expected) {
    const inv = actualInvoice();
    const actual = Number(inv && (inv["請求予定額"] || inv["金額"]) || 0);
    return { label: label, ok: actual === expected, expected: expected, actual: actual };
  }

  const results = [];
  results.push({ operation: "attendance_1", result: attend("2099-08-01", "RUN-B002-01") });
  results.push(assertAmount("1回目", Math.min(unitPrice, cap > 0 ? cap : unitPrice)));

  results.push({ operation: "attendance_2", result: attend("2099-08-08", "RUN-B002-02") });
  results.push(assertAmount("2回目", Math.min(unitPrice * 2, cap > 0 ? cap : unitPrice * 2)));

  // 上限を越える回数まで実際に出席登録する。
  const needed = cap > 0 ? Math.ceil(cap / unitPrice) + 2 : 7;
  for (let i = 3; i <= needed; i++) {
    const day = String(1 + (i - 1) * 3).padStart(2, "0");
    results.push({ operation: "attendance_" + i, result: attend("2099-08-" + day, "RUN-B002-" + String(i).padStart(2, "0")) });
  }
  const expectedCap = cap > 0 ? cap : unitPrice * needed;
  results.push(assertAmount("上限後", expectedCap));

  // 同じ出席を再送しても増えないこと。
  results.push({ operation: "duplicate_resend", result: attend("2099-08-08", "RUN-B002-02") });
  results.push(assertAmount("同一出席再送後", expectedCap));

  const failed = results.filter(function(row) {
    if (row.ok === false) return true;
    return row.result && row.result.ok === false;
  });
  const output = {
    ok: failed.length === 0,
    story: "STORY-B002-REPEAT-ATTENDANCE",
    target_month: targetMonth,
    member_id: memberId,
    plan_id: planId,
    unit_price: unitPrice,
    monthly_cap: cap,
    results: results,
    failed: failed.length,
    message: failed.length === 0
      ? "P002反復出席・累積請求・上限・再送冪等性 PASS"
      : "P002反復出席 FAIL"
  };
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}

// ========================================
// runner_view_paymentStatus_001
// 20_会費状態View/TB の主要端子を実業務経路で検証する。
// 画面は使用しない。
// ========================================
function runner_view_paymentStatus_001() {
  const ctx = createSheetContext();
  ctx.settings = {
    TIME_TRAVEL_ENABLED: "TRUE",
    DEBUG_DATE: "2099-09-01T10:30:00+09:00",
    DEBUG_TARGET_MONTH: "2099-09",
    DEBUG: "TRUE"
  };

  const targetMonth = "2099-09";
  const source = "runner_view_paymentStatus_001";
  const teacher = getTeachers(ctx).find(function(row) {
    return isActiveMasterRow_(row) && isTrueValue_(row["出席受付可"]);
  });
  const member = getMembers(ctx).find(function(row) {
    return isActiveMasterRow_(row) && normalizeId_(row["請求グループID"]);
  });
  const fee = getFees(ctx).find(function(row) {
    return isActiveMasterRow_(row) &&
      String(row["会費タイプ"] || "").trim() === "回数料金" &&
      Number(row["回数単価"] || 0) > 0;
  });

  let scope = null;
  getBillingBlocks(ctx).some(function(block) {
    if (!isActiveMasterRow_(block)) return false;
    const blockId = normalizeId_(block["billing_block_id"]);
    const locationId = normalizeId_(block["location_id"]);
    const slots = getTrainingSlots(ctx).filter(function(row) {
      return isActiveMasterRow_(row) &&
        normalizeId_(row["location_id"]) === locationId &&
        normalizeId_(row["billing_block_id"]) === blockId;
    });
    if (!slots.length) return false;
    scope = {
      location_id: locationId,
      billing_block_id: blockId,
      slot_ids: slots.slice(0, 2).map(function(row) { return normalizeId_(row["slot_id"]); })
    };
    return true;
  });

  if (!teacher || !member || !fee || !scope) {
    const fail = { ok: false, runner: "VIEW-PAYMENT-STATUS-001", message: "Runnerに必要な有効マスタが不足しています。" };
    Logger.log(JSON.stringify(fail, null, 2));
    return fail;
  }

  const memberId = normalizeId_(member["member_id"]);
  const groupId = normalizeId_(member["請求グループID"]);
  const planId = normalizeId_(fee["plan_id"]);
  const unitPrice = Number(fee["回数単価"] || 0);
  const cap = Number(fee["上限金額"] || 0);
  const teacherId = normalizeId_(teacher["teacher_id"]);

  // Runner専用未来月だけを初期化する。
  monthlyIntegration902_deleteRows_("07_出席ログ", function(row) {
    return normalizeMonth(row["target_month"]) === targetMonth && normalizeId_(row["member_id"]) === memberId && normalizeId_(row["source"]) === source;
  }, ctx);
  ["05_請求明細", "04_月次選択", "06_入金ログ", "09_決済エビデンス", "20_会費状態View"].forEach(function(sheetName) {
    monthlyIntegration902_deleteRows_(sheetName, function(row) {
      return normalizeMonth(row["target_month"]) === targetMonth &&
        (normalizeId_(row["billing_group_id"]) === groupId || normalizeId_(row["member_id"]) === memberId);
    }, ctx);
  });

  function setTime(iso) {
    ctx.settings.DEBUG_DATE = iso;
    ctx.settings.DEBUG_TARGET_MONTH = targetMonth;
  }
  function attend(day, session) {
    setTime(day + "T10:30:00+09:00");
    return registerAttendanceBatchLocked_({
      teacher_id: teacherId,
      location_id: scope.location_id,
      billing_block_id: scope.billing_block_id,
      attendance_date: day,
      attendance_session_id: session,
      attendance_items: [{ member_id: memberId, plan_id: planId, slot_ids: scope.slot_ids }],
      source: source
    }, ctx);
  }
  function viewRow() {
    invalidateFeeStatusView(ctx);
    return getFeeStatusViewRows(ctx).find(function(row) {
      return normalizeMonth(row["target_month"]) === targetMonth && normalizeId_(row["member_id"]) === memberId;
    }) || {};
  }
  function check(label, expected) {
    const row = viewRow();
    const failures = [];
    Object.keys(expected).forEach(function(key) {
      const actual = row[key];
      const wanted = expected[key];
      if (String(actual) !== String(wanted)) failures.push({ field: key, expected: wanted, actual: actual });
    });
    return { label: label, ok: failures.length === 0, expected: expected, failures: failures, row: row };
  }

  const results = [];
  results.push({ operation: "attendance_1", result: attend("2099-09-01", "RUN-VIEW-01") });
  const firstAmount = Math.min(unitPrice, cap > 0 ? cap : unitPrice);
  results.push(check("出席1回後", {
    "請求額": firstAmount, "入金額": 0, "未払い額": firstAmount,
    "現金入金額": 0, "PayPay入金額": 0, "その他入金額": 0, "入金件数": 0,
    "出席回数": 1, "Evidence要求中件数": 0, "Evidence確認済件数": 0, "Evidence反映済件数": 0
  }));

  invalidateInvoices(ctx);
  const invoice = getInvoices(ctx).find(function(row) {
    return normalizeMonth(row["target_month"]) === targetMonth && normalizeId_(row["billing_group_id"]) === groupId && normalizeId_(row["plan_id"]) === planId;
  });
  if (!invoice) {
    results.push({ label: "請求取得", ok: false, message: "請求明細が見つかりません。" });
  } else {
    setTime("2099-09-01T11:00:00+09:00");
    const req = paymentEvidence_request({
      invoice_id: normalizeId_(invoice["invoice_id"]), member_id: memberId, payment_method: "PAYPAY",
      location_id: scope.location_id, billing_block_id: scope.billing_block_id, teacher_id: teacherId,
      remarks: source
    }, ctx);
    results.push({ operation: "evidence_request", result: req });
    results.push(check("Evidence REQUESTED後", { "Evidence要求中件数": 1, "Evidence確認済件数": 0, "Evidence反映済件数": 0 }));

    const evidenceId = normalizeId_(req.evidence_id || (req.request && req.request.evidence_id));
    const rec = paymentEvidence_record({ evidence_id: evidenceId, evidence_code: evidenceId + "-OK", confirmed_by: teacherId, remarks: source }, ctx);
    results.push({ operation: "evidence_confirm", result: rec });
    results.push(check("Evidence CONFIRMED後", { "Evidence要求中件数": 0, "Evidence確認済件数": 1, "Evidence反映済件数": 0 }));

    const post = paymentEvidence_post({ evidence_id: evidenceId }, ctx);
    results.push({ operation: "evidence_post", result: post });
    results.push(check("PayPay反映後", {
      "請求額": firstAmount, "入金額": firstAmount, "未払い額": 0,
      "現金入金額": 0, "PayPay入金額": firstAmount, "その他入金額": 0, "入金件数": 1,
      "Evidence要求中件数": 0, "Evidence確認済件数": 0, "Evidence反映済件数": 1,
      "invoice_count": 1
    }));
  }

  results.push({ operation: "attendance_2", result: attend("2099-09-08", "RUN-VIEW-02") });
  const secondAmount = Math.min(unitPrice * 2, cap > 0 ? cap : unitPrice * 2);
  results.push(check("出席2回後", {
    "請求額": secondAmount, "入金額": firstAmount, "未払い額": Math.max(secondAmount - firstAmount, 0),
    "PayPay入金額": firstAmount, "入金件数": 1, "出席回数": 2, "invoice_count": 1
  }));

  const needed = cap > 0 ? Math.ceil(cap / unitPrice) + 2 : 7;
  for (let i = 3; i <= needed; i++) {
    const day = String(1 + (i - 1) * 3).padStart(2, "0");
    results.push({ operation: "attendance_" + i, result: attend("2099-09-" + day, "RUN-VIEW-" + String(i).padStart(2, "0")) });
  }
  const expectedCap = cap > 0 ? cap : unitPrice * needed;
  results.push(check("上限到達後", {
    "請求額": expectedCap, "入金額": firstAmount, "未払い額": Math.max(expectedCap - firstAmount, 0),
    "PayPay入金額": firstAmount, "入金件数": 1, "is_capped": true
  }));

  const failed = results.filter(function(item) {
    if (item.ok === false) return true;
    return item.result && item.result.ok === false;
  });
  const output = {
    ok: failed.length === 0,
    runner: "VIEW-PAYMENT-STATUS-001",
    target_month: targetMonth,
    member_id: memberId,
    plan_id: planId,
    total: results.length,
    failed: failed.length,
    results: results,
    message: failed.length === 0 ? "20_会費状態View 主要端子 PASS" : "20_会費状態View FAIL"
  };
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}
