// ========================================
// 11_MainStoryRunner.js
// Story Runner
// ========================================
//
// TYPE: RUNNER
// TAG: RUNNER
//

function runner_cash_story_c001() {

  const startedAt = Date.now();
  const ctx = createSheetContext();

  const story = "STORY-C001";
  const task = "TASK-DEV-019";

  const steps = [];

  function runStep(step, title, fn) {
    const t0 = Date.now();

    try {
      const result = fn();

      steps.push({
        ok: result && result.ok !== false,
        step,
        title,
        elapsed_ms: Date.now() - t0,
        message: result && result.message ? result.message : "",
        result
      });

    } catch (e) {

      steps.push({
        ok: false,
        step,
        title,
        elapsed_ms: Date.now() - t0,
        message: e.message,
        result: {
          ok: false,
          message: e.message
        }
      });
    }
  }

  //-------------------------------------------------
  // Prepare
  //-------------------------------------------------
  runStep("Prepare", "現金受付用データを準備する", function () {
    const memberId = "M001";
    const planId = "P001";
    const billingGroupId = "G001";
    const targetMonth = sup_targetMonth(ctx);

    runner_deleteRowsByCondition_("04_月次選択", function(row) {
      return normalizeMonth(row["target_month"]) === normalizeMonth(targetMonth) &&
             normalizeId_(row["billing_group_id"]) === billingGroupId;
    }, ctx);

    runner_deleteRowsByCondition_("05_請求明細", function(row) {
      return normalizeMonth(row["target_month"]) === normalizeMonth(targetMonth) &&
             normalizeId_(row["billing_group_id"]) === billingGroupId;
    }, ctx);

    runner_deleteRowsByCondition_("06_入金ログ", function(row) {
      return normalizeMonth(row["target_month"]) === normalizeMonth(targetMonth) &&
             normalizeId_(row["billing_group_id"]) === billingGroupId;
    }, ctx);

    runner_deleteRowsByCondition_("09_決済エビデンス", function(row) {
      return normalizeMonth(row["target_month"]) === normalizeMonth(targetMonth) &&
             normalizeId_(row["billing_group_id"]) === billingGroupId;
    }, ctx);

    invalidateMonthlySelections(ctx);
    invalidateInvoices(ctx);
    invalidatePayments(ctx);
    paymentEvidence_invalidate(ctx);
    invalidateFeeStatusView(ctx);

    const billingResult = billingMonthlyAccept(memberId, planId, ctx);
    const paymentInfo = getPaymentStatus(memberId, ctx);

    return {
      ok: billingResult && billingResult.ok === true,
      member_id: memberId,
      plan_id: planId,
      billing_group_id: billingGroupId,
      target_month: normalizeMonth(targetMonth),
      billingResult,
      paymentInfo,
      message: "現金受付用の未払い請求を準備しました。"
    };
  });

  //-------------------------------------------------
  // Cash Receive
  //-------------------------------------------------
  let cashReceiveResult = null;
  runStep("CashReceive", "現金受付を実行する", function () {
    const paymentInfo = getPaymentStatus("M001", ctx);

    const paymentItems = (paymentInfo.invoiceItems || []).map(function(invoice) {
      return {
        invoice_id: invoice.invoice_id,
        member_id: invoice.member_id || "M001",
        billing_group_id: invoice.billing_group_id || "G001",
        target_month: invoice.target_month || paymentInfo.targetMonth,
        plan_id: invoice.plan_id || "P001",
        amount: Number(invoice.amount || 0),
        payment_method: "CASH"
      };
    });

    const result = paymentEvidence_acceptBatch({
      teacher_id: "T001",
      location_id: "HONBU",
      billing_block_id: "B_KYO_MON_1030_1230",
      reception_session_id: "RUNNER-C001-" + normalizeMonth(sup_targetMonth(ctx)),
      payment_items: paymentItems,
      source: "runner_cash_story_c001"
    }, ctx);
    
    cashReceiveResult = {
      ok: result && result.ok !== false,
      payment_items: paymentItems,
      result: result,
      message: "現金受付を実行しました。"
    };

    return cashReceiveResult;
  });

  //-------------------------------------------------
  // Verify PaymentLog
  //-------------------------------------------------
  runStep("VerifyPaymentLog", "06_入金ログを確認する", function () {
    const invoiceId = cashReceiveResult.payment_items[0].invoice_id;

    const payments = getPayments(ctx).filter(function(p) {
      return normalizeId_(p["invoice_id"]) === normalizeId_(invoiceId) &&
            (normalizeId_(p["支払方法"]) === "CASH" || String(p["支払方法"]) === "現金");
    });

    return {
      ok: payments.length > 0,
      count: payments.length,
      invoice_id: invoiceId,
      payments,
      message: payments.length > 0
        ? "06_入金ログに現金入金を確認しました。"
        : "06_入金ログに現金入金がありません。"
    };
  });

  //-------------------------------------------------
  // Verify Invoice
  //-------------------------------------------------

  runStep("VerifyInvoice", "05_請求明細を確認する", function () {

    const invoiceId = cashReceiveResult.payment_items[0].invoice_id;

    const invoice = getInvoices(ctx).find(function (row) {
      return normalizeId_(row["invoice_id"]) === normalizeId_(invoiceId);
    });

    const ok =
        invoice &&
        String(invoice["支払状態"]) === "支払済";

    return {
      ok: ok,
      invoice: invoice,
      message: ok
        ? "05_請求明細が支払済になりました。"
        : "05_請求明細が支払済になっていません。"
    };
  });

  //-------------------------------------------------
  // Verify View
  //-------------------------------------------------
  runStep("VerifyView", "20_会費状態Viewを確認する", function () {

    const paymentStatus = getPaymentStatus("M001", ctx);

    const ok =
        paymentStatus &&
        paymentStatus.isPaid === true;

    return {
      ok: ok,
      paymentStatus: paymentStatus,
      message: ok
        ? "20_会費状態Viewが支払済になりました。"
        : "20_会費状態Viewが未払いです。"
    };
  });

  //-------------------------------------------------

  const success = steps.filter(s => s.ok).length;
  const failed = steps.filter(s => !s.ok).length;

  const summary = {
    ok: failed === 0,
    story,
    task,
    total: steps.length,
    success,
    failed,
    elapsed_ms: Date.now() - startedAt,
    steps
  };

  Logger.log(JSON.stringify(summary, null, 2));

  return summary;
}


function runner_deleteRowsByCondition_(sheetName, predicate, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = getRequiredSheet_(sheetName, ctx);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return 0;

  const headers = values[0];
  let deleted = 0;

  for (let r = values.length - 1; r >= 1; r--) {
    const row = {};
    headers.forEach(function(header, index) {
      row[header] = values[r][index];
    });

    if (predicate(row)) {
      sheet.deleteRow(r + 1);
      deleted++;
    }
  }

  invalidateSheetRows(ctx, sheetName);
  return deleted;
}
