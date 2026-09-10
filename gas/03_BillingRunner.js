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
    return item && item.ok === false;
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

// ========================================
// runner_billing_story_003_teacherPartialCash
// P002: 同一invoiceへの先生現金受付を2回行う実運用経路を検証する。
// 1回目出席→1500円現金、2回目出席→追加1500円現金、を
// paymentEvidence_acceptBatch(payment_teacher.html) 経路で実行する。
// ========================================
function runner_billing_story_003_teacherPartialCash() {
  const ctx = createSheetContext();
  ctx.settings = {
    TIME_TRAVEL_ENABLED: "TRUE",
    DEBUG_DATE: "2099-10-01T09:00:00+09:00",
    DEBUG_TARGET_MONTH: "2099-10",
    DEBUG: "TRUE"
  };

  const targetMonth = "2099-10";
  const source = "runner_billing_story_003_teacherPartialCash";
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
    const fail = { ok: false, runner: "BILLING-P002-TEACHER-PARTIAL-CASH-001", message: "Runnerに必要な有効マスタが不足しています。" };
    Logger.log(JSON.stringify(fail, null, 2));
    return fail;
  }

  const teacherId = normalizeId_(teacher["teacher_id"]);
  const memberId = normalizeId_(member["member_id"]);
  const groupId = normalizeId_(member["請求グループID"]);
  const planId = normalizeId_(fee["plan_id"]);
  const unitPrice = Number(fee["回数単価"] || 0);

  // Runner専用未来月の既存invoiceに紐づくEvidenceを先に除去する。
  invalidateInvoices(ctx);
  const oldInvoiceIds = getInvoices(ctx).filter(function(row) {
    return normalizeMonth(row["target_month"]) === targetMonth &&
      normalizeId_(row["billing_group_id"]) === groupId;
  }).map(function(row) { return normalizeId_(row["invoice_id"]); });

  monthlyIntegration902_deleteRows_("09_決済エビデンス", function(row) {
    return oldInvoiceIds.indexOf(normalizeId_(row["invoice_id"])) >= 0;
  }, ctx);
  ["07_出席ログ", "06_入金ログ", "05_請求明細", "04_月次選択", "20_会費状態View"].forEach(function(sheetName) {
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
  function invoiceRow() {
    invalidateInvoices(ctx);
    return getInvoices(ctx).find(function(row) {
      return normalizeMonth(row["target_month"]) === targetMonth &&
        normalizeId_(row["billing_group_id"]) === groupId &&
        normalizeId_(row["plan_id"]) === planId;
    });
  }
  function cashReceive(amount, suffix) {
    const invoice = invoiceRow();
    if (!invoice) return { ok: false, message: "請求明細が見つかりません。" };
    setTime("2099-10-" + suffix + "T11:00:00+09:00");
    return paymentEvidence_acceptBatch({
      mode: "payment_batch",
      teacher_id: teacherId,
      location_id: scope.location_id,
      billing_block_id: scope.billing_block_id,
      reception_session_id: "RUN-P002-CASH-" + suffix,
      payment_items: [{
        invoice_id: normalizeId_(invoice["invoice_id"]),
        member_id: memberId,
        billing_group_id: groupId,
        target_month: targetMonth,
        plan_id: planId,
        amount: amount,
        payment_method: "現金",
        location_id: scope.location_id,
        billing_block_id: scope.billing_block_id,
        teacher_id: teacherId,
        reception_session_id: "RUN-P002-CASH-" + suffix
      }],
      source: "payment_teacher.html"
    }, ctx);
  }
  function state(label, expectedBilled, expectedPaid, expectedUnpaid, expectedPaymentCount, expectedInvoiceStatus) {
    invalidateInvoices(ctx);
    invalidatePayments(ctx);
    invalidateFeeStatusView(ctx);
    const invoice = invoiceRow() || {};
    const payments = getPayments(ctx).filter(function(row) {
      return normalizeId_(row["invoice_id"]) === normalizeId_(invoice["invoice_id"]);
    });
    const view = getFeeStatusViewRows(ctx).find(function(row) {
      return normalizeMonth(row["target_month"]) === targetMonth && normalizeId_(row["member_id"]) === memberId;
    }) || {};
    const actual = {
      billed: Number(invoice["金額"] || 0),
      paid: Number(view["入金額"] || 0),
      unpaid: Number(view["未払い額"] || 0),
      payment_count: payments.length,
      invoice_status: String(invoice["支払状態"] || "")
    };
    const expected = {
      billed: expectedBilled,
      paid: expectedPaid,
      unpaid: expectedUnpaid,
      payment_count: expectedPaymentCount,
      invoice_status: expectedInvoiceStatus
    };
    const ok = Object.keys(expected).every(function(key) { return String(actual[key]) === String(expected[key]); });
    return { label: label, ok: ok, expected: expected, actual: actual, invoice_id: normalizeId_(invoice["invoice_id"]) };
  }

  function summarizeAttendance(operation, result) {
    return {
      operation: operation,
      ok: !!(result && result.ok),
      registered_count: Number(result && result.registered_count || 0),
      message: String(result && result.message || "")
    };
  }
  function summarizeCash(operation, result) {
    const requestResult = result && result.requestResult || {};
    const recordResult = result && result.recordResult || {};
    const postResult = result && result.postResult || {};
    const postItems = Array.isArray(postResult.results) ? postResult.results : [];
    return {
      operation: operation,
      ok: !!(result && result.ok),
      request_ok: !!requestResult.ok,
      requested_count: Array.isArray(requestResult.records) ? requestResult.records.length : 0,
      record_ok: !!recordResult.ok,
      confirmed_count: Array.isArray(recordResult.completed) ? recordResult.completed.length : 0,
      post_ok: !!postResult.ok,
      posted_count: postItems.filter(function(item) { return item && item.ok; }).length,
      post_results: postItems.map(function(item) {
        const posted = item && item.result || {};
        const registered = posted.registerResult || {};
        return {
          evidence_id: String(item && item.evidence_id || ""),
          ok: !!(item && item.ok),
          payment_id: normalizeId_(posted.payment && posted.payment.payment_id),
          payment_amount: Number(posted.payment && posted.payment["入金額"] || 0),
          register_ok: !!registered.ok,
          register_skipped: !!registered.skipped,
          register_message: String(registered.message || ""),
          error: String(item && (item.error || item.message) || posted.error || posted.message || "")
        };
      }),
      message: String(result && result.message || postResult.message || recordResult.message || requestResult.message || "")
    };
  }

  const results = [];
  const attendance1 = attend("2099-10-01", "RUN-P002-CASH-A1");
  results.push(summarizeAttendance("attendance_1", attendance1));
  results.push(state("1回目出席後", unitPrice, 0, unitPrice, 0, "未払い"));

  const pay1 = cashReceive(unitPrice, "01");
  results.push(summarizeCash("cash_1", pay1));
  results.push(state("1回目現金受付後", unitPrice, unitPrice, 0, 1, "支払済"));

  const attendance2 = attend("2099-10-08", "RUN-P002-CASH-A2");
  results.push(summarizeAttendance("attendance_2", attendance2));
  results.push(state("2回目出席後", unitPrice * 2, unitPrice, unitPrice, 1, "未払い"));

  const pay2 = cashReceive(unitPrice, "08");
  results.push(summarizeCash("cash_2", pay2));
  results.push(state("2回目現金受付後", unitPrice * 2, unitPrice * 2, 0, 2, "支払済"));

  const failed = results.filter(function(item) {
    return item && item.ok === false;
  });
  const output = {
    ok: failed.length === 0,
    runner: "BILLING-P002-TEACHER-PARTIAL-CASH-001",
    target_month: targetMonth,
    member_id: memberId,
    plan_id: planId,
    total: results.length,
    failed: failed.length,
    results: results,
    message: failed.length === 0
      ? "P002 先生現金受付・同一invoice追加入金 PASS"
      : "P002 先生現金受付・同一invoice追加入金 FAIL"
  };
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}


// ========================================
// runner_billing_story_004_perUseComplexMonth
// P002: 実運用で最も複雑な月内Storyを再演する。
// - 同一invoiceへの複数回追加入金
// - 同一日・異なる課金枠（午前/午後）
// - 現金→PayPay混在
// - 月額上限到達
// - 上限超過後は追加決済不要
//
// Runner専用日付: 2099-01
// 1: 01/05(月) 10:30-12:30 現金
// 2: 01/09(金) 10:30-12:30 現金
// 3: 01/11(日) 10:30-12:30 現金
// 4: 01/11(日) 14:30-16:30 PayPay
// 5: 01/12(月) 10:30-12:30 PayPay
// 6: 01/14(水) 19:30-21:30 追加決済なし（上限超過）
// ========================================
function runner_billing_story_004_perUseComplexMonth() {
  const ctx = createSheetContext();
  ctx.settings = {
    TIME_TRAVEL_ENABLED: "TRUE",
    DEBUG_DATE: "2099-01-05T10:30:00+09:00",
    DEBUG_TARGET_MONTH: "2099-01",
    DEBUG: "TRUE"
  };

  const targetMonth = "2099-01";
  const source = "runner_billing_story_004_perUseComplexMonth";
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

  if (!teacher || !member || !fee) {
    const fail = { ok: false, runner: "BILLING-P002-COMPLEX-MONTH-001", message: "Runnerに必要な有効マスタが不足しています。" };
    Logger.log(JSON.stringify(fail, null, 2));
    return fail;
  }

  const teacherId = normalizeId_(teacher["teacher_id"]);
  const memberId = normalizeId_(member["member_id"]);
  const groupId = normalizeId_(member["請求グループID"]);
  const planId = normalizeId_(fee["plan_id"]);
  const unitPrice = Number(fee["回数単価"] || 0);
  const cap = Number(fee["月額上限"] || fee["上限金額"] || 0) || unitPrice * 5;
  const locationId = "HONBU";

  function findScope(weekday, startText, endText) {
    const blocks = getBillingBlocks(ctx);
    const slots = getTrainingSlots(ctx);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!isActiveMasterRow_(block)) continue;
      if (normalizeId_(block["location_id"]) !== locationId) continue;
      if (!weekdayMatches_(block["曜日"], weekday)) continue;
      const blockId = normalizeId_(block["billing_block_id"]);
      const blockSlots = slots.filter(function(row) {
        return isActiveMasterRow_(row) &&
          normalizeId_(row["location_id"]) === locationId &&
          normalizeId_(row["billing_block_id"]) === blockId;
      });
      if (!blockSlots.length) continue;
      const start = Math.min.apply(null, blockSlots.map(function(row) { return timeToMinutes_(row["開始時刻"]); }));
      const end = Math.max.apply(null, blockSlots.map(function(row) { return timeToMinutes_(row["終了時刻"]); }));
      if (minutesToTimeText_(start) === startText && minutesToTimeText_(end) === endText) {
        return {
          location_id: locationId,
          billing_block_id: blockId,
          slot_ids: blockSlots.map(function(row) { return normalizeId_(row["slot_id"]); }),
          weekday: weekday,
          start_time: startText,
          end_time: endText
        };
      }
    }
    return null;
  }

  const scopes = {
    mon_am: findScope("月", "10:30", "12:30"),
    fri_am: findScope("金", "10:30", "12:30"),
    sun_am: findScope("日", "10:30", "12:30"),
    sun_pm: findScope("日", "14:30", "16:30"),
    wed_pm: findScope("水", "19:30", "21:30")
  };

  const missingScopes = Object.keys(scopes).filter(function(key) { return !scopes[key]; });
  if (missingScopes.length) {
    const fail = {
      ok: false,
      runner: "BILLING-P002-COMPLEX-MONTH-001",
      message: "Runnerに必要な課金枠が見つかりません。",
      missing_scopes: missingScopes,
      scopes: scopes
    };
    Logger.log(JSON.stringify(fail, null, 2));
    return fail;
  }

  // Runner専用未来月を初期化する。
  invalidateInvoices(ctx);
  const oldInvoiceIds = getInvoices(ctx).filter(function(row) {
    return normalizeMonth(row["target_month"]) === targetMonth &&
      normalizeId_(row["billing_group_id"]) === groupId;
  }).map(function(row) { return normalizeId_(row["invoice_id"]); });

  monthlyIntegration902_deleteRows_("09_決済エビデンス", function(row) {
    return oldInvoiceIds.indexOf(normalizeId_(row["invoice_id"])) >= 0;
  }, ctx);
  ["07_出席ログ", "06_入金ログ", "05_請求明細", "04_月次選択", "20_会費状態View"].forEach(function(sheetName) {
    monthlyIntegration902_deleteRows_(sheetName, function(row) {
      return normalizeMonth(row["target_month"]) === targetMonth &&
        (normalizeId_(row["billing_group_id"]) === groupId || normalizeId_(row["member_id"]) === memberId);
    }, ctx);
  });

  function setTime(iso) {
    ctx.settings.DEBUG_DATE = iso;
    ctx.settings.DEBUG_TARGET_MONTH = targetMonth;
  }

  function attend(day, time, scope, no) {
    setTime(day + "T" + time + ":00+09:00");
    return registerAttendanceBatchLocked_({
      teacher_id: teacherId,
      location_id: scope.location_id,
      billing_block_id: scope.billing_block_id,
      attendance_date: day,
      attendance_session_id: "RUN-P002-COMPLEX-A" + no,
      attendance_items: [{
        member_id: memberId,
        plan_id: planId,
        slot_ids: scope.slot_ids
      }],
      source: source
    }, ctx);
  }

  function invoiceRow() {
    invalidateInvoices(ctx);
    return getInvoices(ctx).find(function(row) {
      return normalizeMonth(row["target_month"]) === targetMonth &&
        normalizeId_(row["billing_group_id"]) === groupId &&
        normalizeId_(row["plan_id"]) === planId;
    });
  }

  function cashReceive(day, time, scope, no) {
    const invoice = invoiceRow();
    if (!invoice) return { ok: false, message: "請求明細が見つかりません。" };
    setTime(day + "T" + time + ":00+09:00");
    return paymentEvidence_acceptBatch({
      mode: "payment_batch",
      teacher_id: teacherId,
      location_id: scope.location_id,
      billing_block_id: scope.billing_block_id,
      reception_session_id: "RUN-P002-COMPLEX-CASH-" + no,
      payment_items: [{
        invoice_id: normalizeId_(invoice["invoice_id"]),
        member_id: memberId,
        billing_group_id: groupId,
        target_month: targetMonth,
        plan_id: planId,
        amount: unitPrice,
        payment_method: "現金",
        location_id: scope.location_id,
        billing_block_id: scope.billing_block_id,
        teacher_id: teacherId,
        reception_session_id: "RUN-P002-COMPLEX-CASH-" + no
      }],
      source: "payment_teacher.html"
    }, ctx);
  }

  function paypayReceive(day, time, scope, no) {
    setTime(day + "T" + time + ":00+09:00");

    function evidenceSnapshot_(label) {
      invalidatePaymentEvidences(ctx);
      const rows = getPaymentEvidences(ctx).filter(function(row) {
        return normalizeMonth(row["target_month"]) === targetMonth ||
          normalizeId_(row["invoice_id"]) === normalizeId_((invoiceRow() || {})["invoice_id"]);
      }).map(function(row) {
        return {
          evidence_id: normalizeId_(row["evidence_id"]),
          invoice_id: normalizeId_(row["invoice_id"]),
          member_id: normalizeId_(row["member_id"]),
          payment_method: String(row["payment_method"] || row["支払方法"] || ""),
          amount: Number(row["amount"] || row["金額"] || 0),
          status: String(row["status"] || row["状態"] || "")
        };
      });
      Logger.log("[RUNNER-PAYPAY-TRACE] " + label + " : " + JSON.stringify(rows));
      return rows;
    }

    const before = evidenceSnapshot_("before_start_" + no);

    const start = paypayCode_start({
      member_id: memberId,
      plan_id: planId,
      teacher_id: "PAYPAY_MEMBER",
      location_id: scope.location_id,
      billing_block_id: scope.billing_block_id,
      reception_session_id: "RUN-P002-COMPLEX-PAYPAY-" + no
    }, ctx);

    const evidenceItems = Array.isArray(start && start.evidenceItems) ? start.evidenceItems : [];
    Logger.log("[RUNNER-PAYPAY-TRACE] start_result_" + no + " : " + JSON.stringify({
      ok: start && start.ok,
      evidence_items: evidenceItems.map(function(item) {
        return {
          evidence_id: normalizeId_(item["evidence_id"] || item.evidence_id),
          invoice_id: normalizeId_(item["invoice_id"] || item.invoice_id),
          payment_method: String(item["payment_method"] || item.payment_method || ""),
          amount: Number(item["amount"] || item.amount || 0),
          status: String(item["status"] || item.status || "")
        };
      })
    }));

    const afterStart = evidenceSnapshot_("after_start_" + no);

    if (!start || start.ok !== true || evidenceItems.length === 0) {
      return {
        ok: false,
        phase: "start",
        start: start,
        trace: { before: before, after_start: afterStart },
        message: "PayPay Evidence要求を開始できませんでした。"
      };
    }

    Logger.log("[RUNNER-PAYPAY-TRACE] record_target_" + no + " : " + JSON.stringify(
      evidenceItems.map(function(item) {
        return normalizeId_(item["evidence_id"] || item.evidence_id);
      })
    ));

    const record = paypayCode_record({
      member_id: memberId,
      evidence_code: "RUN-PAYPAY-" + no + "-OK",
      evidence_items: evidenceItems
    }, ctx);

    const afterRecord = evidenceSnapshot_("after_record_" + no);

    const postResults = [];
    let postError = null;
    for (let i = 0; i < evidenceItems.length; i++) {
      const item = evidenceItems[i];
      const evidenceId = normalizeId_(item["evidence_id"] || item.evidence_id);
      if (!evidenceId) continue;
      Logger.log("[RUNNER-PAYPAY-TRACE] post_target_" + no + " : " + evidenceId);
      try {
        postResults.push(paymentEvidence_post({ evidence_id: evidenceId }, ctx));
      } catch (e) {
        postError = {
          evidence_id: evidenceId,
          message: String(e && e.message || e),
          stack: String(e && e.stack || "")
        };
        Logger.log("[RUNNER-PAYPAY-TRACE] post_error_" + no + " : " + JSON.stringify(postError));
        break;
      }
    }

    const afterPost = evidenceSnapshot_("after_post_" + no);

    return {
      ok: !postError &&
        start.ok === true &&
        record && record.ok !== false &&
        postResults.length > 0 &&
        postResults.every(function(row) { return row && row.ok !== false; }),
      phase: postError ? "post" : "completed",
      start: start,
      record: record,
      posts: postResults,
      post_error: postError,
      evidence_items: evidenceItems,
      trace: {
        before: before,
        after_start: afterStart,
        after_record: afterRecord,
        after_post: afterPost
      }
    };
  }

  function state(label, expected) {
    invalidateInvoices(ctx);
    invalidatePayments(ctx);
    invalidateFeeStatusView(ctx);
    const invoice = invoiceRow() || {};
    const payments = getPayments(ctx).filter(function(row) {
      return normalizeId_(row["invoice_id"]) === normalizeId_(invoice["invoice_id"]);
    });
    const view = getFeeStatusViewRows(ctx).find(function(row) {
      return normalizeMonth(row["target_month"]) === targetMonth &&
        normalizeId_(row["member_id"]) === memberId;
    }) || {};

    const actual = {
      quantity: Number(invoice["数量"] || 0),
      calculated: Number(invoice["計算額"] || 0),
      billed: Number(invoice["金額"] || 0),
      paid: Number(view["入金額"] || 0),
      cash: Number(view["現金入金額"] || 0),
      paypay: Number(view["PayPay入金額"] || 0),
      unpaid: Number(view["未払い額"] || 0),
      payment_count: payments.length,
      attendance_count: Number(view["出席回数"] || 0),
      is_capped: String(view["is_capped"] || "").toUpperCase(),
      invoice_status: String(invoice["支払状態"] || "")
    };

    const failures = [];
    Object.keys(expected).forEach(function(key) {
      if (String(actual[key]) !== String(expected[key])) {
        failures.push({ field: key, expected: expected[key], actual: actual[key] });
      }
    });

    return {
      label: label,
      ok: failures.length === 0,
      expected: expected,
      actual: actual,
      failures: failures,
      invoice_id: normalizeId_(invoice["invoice_id"])
    };
  }

  function op(name, result, scope) {
    return {
      operation: name,
      ok: !!(result && result.ok),
      billing_block_id: scope && scope.billing_block_id || "",
      scope: scope ? scope.weekday + " " + scope.start_time + "-" + scope.end_time : "",
      result: result
    };
  }

  const results = [];
  const cap5 = Math.min(unitPrice * 5, cap);
  const calc6 = unitPrice * 6;

  results.push(op("attendance_1", attend("2099-01-05", "10:30", scopes.mon_am, 1), scopes.mon_am));
  results.push(op("cash_1", cashReceive("2099-01-05", "11:00", scopes.mon_am, 1), scopes.mon_am));
  results.push(state("1回目完了", {
    quantity: 1, calculated: unitPrice, billed: unitPrice, paid: unitPrice,
    cash: unitPrice, paypay: 0, unpaid: 0, payment_count: 1, attendance_count: 1,
    is_capped: "", invoice_status: "支払済"
  }));

  results.push(op("attendance_2", attend("2099-01-09", "10:30", scopes.fri_am, 2), scopes.fri_am));
  results.push(op("cash_2", cashReceive("2099-01-09", "11:00", scopes.fri_am, 2), scopes.fri_am));
  results.push(state("2回目完了", {
    quantity: 2, calculated: unitPrice * 2, billed: unitPrice * 2, paid: unitPrice * 2,
    cash: unitPrice * 2, paypay: 0, unpaid: 0, payment_count: 2, attendance_count: 2,
    is_capped: "", invoice_status: "支払済"
  }));

  results.push(op("attendance_3", attend("2099-01-11", "10:30", scopes.sun_am, 3), scopes.sun_am));
  results.push(op("cash_3", cashReceive("2099-01-11", "11:00", scopes.sun_am, 3), scopes.sun_am));
  results.push(state("3回目完了", {
    quantity: 3, calculated: unitPrice * 3, billed: unitPrice * 3, paid: unitPrice * 3,
    cash: unitPrice * 3, paypay: 0, unpaid: 0, payment_count: 3, attendance_count: 3,
    is_capped: "", invoice_status: "支払済"
  }));

  // 同一日2回目・別課金枠。現在の実運用NG再現ポイント。
  results.push(op("attendance_4_same_day_pm", attend("2099-01-11", "14:30", scopes.sun_pm, 4), scopes.sun_pm));
  results.push(state("4回目出席後・PayPay前", {
    quantity: 4, calculated: unitPrice * 4, billed: unitPrice * 4, paid: unitPrice * 3,
    cash: unitPrice * 3, paypay: 0, unpaid: unitPrice, payment_count: 3, attendance_count: 4,
    is_capped: "", invoice_status: "未払い"
  }));
  results.push(op("paypay_4_same_day_pm", paypayReceive("2099-01-11", "15:00", scopes.sun_pm, 4), scopes.sun_pm));
  results.push(state("4回目PayPay完了", {
    quantity: 4, calculated: unitPrice * 4, billed: unitPrice * 4, paid: unitPrice * 4,
    cash: unitPrice * 3, paypay: unitPrice, unpaid: 0, payment_count: 4, attendance_count: 4,
    is_capped: "", invoice_status: "支払済"
  }));

  results.push(op("attendance_5_cap", attend("2099-01-12", "10:30", scopes.mon_am, 5), scopes.mon_am));
  results.push(op("paypay_5_cap", paypayReceive("2099-01-12", "11:00", scopes.mon_am, 5), scopes.mon_am));
  results.push(state("5回目・上限到達", {
    quantity: 5, calculated: unitPrice * 5, billed: cap5, paid: cap5,
    cash: unitPrice * 3, paypay: unitPrice * 2, unpaid: 0, payment_count: 5, attendance_count: 5,
    is_capped: "TRUE", invoice_status: "支払済"
  }));

  // 6回目は出席のみ。計算額は増えるが請求額は上限で停止し、決済は増えない。
  results.push(op("attendance_6_over_cap_free", attend("2099-01-14", "19:30", scopes.wed_pm, 6), scopes.wed_pm));
  results.push(state("6回目・上限超過・追加決済なし", {
    quantity: 6, calculated: calc6, billed: cap5, paid: cap5,
    cash: unitPrice * 3, paypay: unitPrice * 2, unpaid: 0, payment_count: 5, attendance_count: 6,
    is_capped: "TRUE", invoice_status: "支払済"
  }));

  const failed = results.filter(function(item) { return item && item.ok === false; });
  const output = {
    ok: failed.length === 0,
    runner: "BILLING-P002-COMPLEX-MONTH-001",
    target_month: targetMonth,
    member_id: memberId,
    plan_id: planId,
    unit_price: unitPrice,
    cap: cap,
    scopes: scopes,
    total: results.length,
    failed: failed.length,
    results: results,
    message: failed.length === 0
      ? "P002 複合月間Story PASS"
      : "P002 複合月間Story FAIL"
  };
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}
