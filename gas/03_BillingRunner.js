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