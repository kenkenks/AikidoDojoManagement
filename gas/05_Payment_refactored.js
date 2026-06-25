// 05_Payment.gs
//   入金を受け付ける
//   入金ログを書く
//   請求の支払状態を更新する

// ==============================
// 入金受付（メイン）
// ==============================
function payment_accept(memberId, paymentMethod, paymentEvidenceId, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());

  // ① 入力・関連情報を集める
  const paymentContext =
    payment_collectContext(memberId, paymentMethod, paymentEvidenceId, ctx);

  // ② 入金ログ用データを作る
  const payment =
    payment_make(paymentContext);

  // ③ 入金ログへ登録する
  const registerResult =
    payment_register(payment, ctx);

  // ④ 請求の支払状態を更新する
  const statusUpdate =
    payment_updateInvoiceStatus(
      payment.target_month,
      payment.billing_group_id,
      ctx
    );

  // ⑤ Viewを更新する
  const viewUpdate =
    paymentStatusView_refresh(
      payment.member_id,
      payment.target_month,
      ctx
    );

  return {
    ok: true,
    payment,
    registerResult,
    statusUpdate,
    viewUpdate
  };
}

// ==============================
// 情報収集
// ==============================
function payment_collectContext(memberId, paymentMethod, paymentEvidenceId, ctx) {
  ctx = ensureSheetContext(ctx);

  if (!memberId) {
    throw new Error("memberId がありません。");
  }

  if (!paymentMethod) {
    throw new Error("支払方法がありません。");
  }

  if (!paymentEvidenceId) {
    throw new Error("決済ID（入金確認済エビデンス）がありません。");
  }

  const targetMonth = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM"
  );

  const members = getMembers(ctx);
  const member = members.find(m =>
    String(m["member_id"]).trim() === String(memberId).trim()
  );

  if (!member) {
    throw new Error("会員が見つかりません。");
  }

  const billingGroupId = String(member["請求グループID"] || "").trim();
  if (!billingGroupId) {
    throw new Error("請求グループIDがありません。");
  }

  const invoices = getInvoices(ctx);
  const invoice = invoices.find(inv =>
    normalizeMonth(inv["target_month"]) === normalizeMonth(targetMonth) &&
    String(inv["billing_group_id"]).trim() === billingGroupId &&
    String(inv["支払状態"]).trim() !== "支払済"
  );

  if (!invoice) {
    throw new Error("未払いの請求明細が見つかりません。");
  }

  const amount = Number(invoice["請求予定額"] || invoice["金額"] || 0);

  return {
    memberId,
    billingGroupId,
    invoiceId: invoice["invoice_id"] || "",
    targetMonth,
    paymentMethod,
    amount,
    paymentEvidenceId,
    note: `${paymentMethod}で入金確認`
  };
}

// ==============================
// Payment生成
// ==============================
function payment_make(paymentContext) {
  if (!paymentContext.paymentEvidenceId) {
    throw new Error("決済ID（入金確認済エビデンス）がありません。");
  }

  return {
    payment_id: "PAY-" + Utilities.getUuid().slice(0, 8),
    日時: new Date(),
    target_month: normalizeMonth(paymentContext.targetMonth),
    billing_group_id: paymentContext.billingGroupId,
    invoice_id: paymentContext.invoiceId || "",
    member_id: paymentContext.memberId || "",
    支払方法: paymentContext.paymentMethod,
    入金額: Number(paymentContext.amount || 0),
    決済ID: paymentContext.paymentEvidenceId,
    備考: paymentContext.note || ""
  };
}

// ==============================
// 入金登録
// ==============================
function payment_register(payment, ctx) {
  ctx = ensureSheetContext(ctx);

  if (!payment.決済ID) {
    return {
      ok: false,
      message: "決済ID（入金確認済エビデンス）がありません。"
    };
  }

  const payments = getPayments(ctx);
  const duplicated = payments.some(p =>
    String(p["決済ID"] || "").trim() === String(payment.決済ID).trim()
  );

  if (duplicated) {
    return {
      ok: true,
      skipped: true,
      message: "既に処理済みの決済IDです。",
      payment
    };
  }

  payment_append(ctx, payment);

  return {
    ok: true,
    skipped: false,
    message: `${payment.入金額}円を入金ログへ登録しました。`,
    payment
  };
}

// ==============================
// 支払状態更新
// ==============================
function payment_updateInvoiceStatus(targetMonth, billingGroupId, ctx) {
  ctx = ensureSheetContext(ctx);

  const payments = getPayments(ctx);
  const invoiceSheet = ctx.ss.getSheetByName("05_請求明細");

  const values = invoiceSheet.getDataRange().getValues();
  if (values.length <= 1) {
    return {
      ok: true,
      message: "請求明細がありません。",
      updated: 0
    };
  }

  const headers = values[0];
  const col = {};
  headers.forEach((h, i) => col[h] = i);

  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedBillingGroupId = String(billingGroupId).trim();

  const paidTotal = payment_getPaidTotal(
    payments,
    normalizedTargetMonth,
    normalizedBillingGroupId
  );

  let updated = 0;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    const rowMonth = normalizeMonth(row[col["target_month"]]);
    const rowGroup = String(row[col["billing_group_id"]]).trim();

    if (
      rowMonth === normalizedTargetMonth &&
      rowGroup === normalizedBillingGroupId
    ) {
      const plannedAmount = Number(
        row[col["請求予定額"]] || row[col["金額"]] || 0
      );

      const unpaidAmount = plannedAmount - paidTotal;
      const status = unpaidAmount <= 0 ? "支払済" : "未払い";

      invoiceSheet
        .getRange(r + 1, col["支払状態"] + 1)
        .setValue(status);

      updated++;
    }
  }

  invalidateInvoices(ctx);

  return {
    ok: true,
    targetMonth: normalizedTargetMonth,
    billingGroupId: normalizedBillingGroupId,
    paidTotal,
    updated
  };
}

// ==============================
// DAO
// ==============================
function payment_append(ctx, payment) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("06_入金ログ");

  appendObjectsByHeader_(sheet, [{
    payment_id: payment.payment_id,
    日時: payment.日時,
    target_month: payment.target_month,
    billing_group_id: payment.billing_group_id,
    invoice_id: payment.invoice_id,
    member_id: payment.member_id,
    支払方法: payment.支払方法,
    入金額: payment.入金額,
    決済ID: payment.決済ID,
    備考: payment.備考
  }]);

  invalidatePayments(ctx);
}

// ==============================
// Calc
// ==============================
function payment_getPaidTotal(payments, targetMonth, billingGroupId) {
  return payments
    .filter(p =>
      normalizeMonth(p["target_month"]) === normalizeMonth(targetMonth) &&
      String(p["billing_group_id"]).trim() === String(billingGroupId).trim()
    )
    .reduce((sum, p) => sum + Number(p["入金額"] || p["金額"] || 0), 0);
}

// ==============================
// 互換ラッパー
// ==============================
function acceptPayment(memberId, paymentMethod, paymentEvidenceId, ctx) {
  return payment_accept(memberId, paymentMethod, paymentEvidenceId, ctx);
}

function collectPaymentContext(memberId, paymentMethod, paymentEvidenceId, ctx) {
  return payment_collectContext(memberId, paymentMethod, paymentEvidenceId, ctx);
}

function makePayment(paymentContext) {
  return payment_make(paymentContext);
}

function registerPayment(payment, ctx) {
  return payment_register(payment, ctx);
}

function updateInvoicePaymentStatus(targetMonth, billingGroupId, ctx) {
  return payment_updateInvoiceStatus(targetMonth, billingGroupId, ctx);
}

function appendPayment(ctx, payment) {
  return payment_append(ctx, payment);
}

function getPaidTotal(payments, targetMonth, billingGroupId) {
  return payment_getPaidTotal(payments, targetMonth, billingGroupId);
}
