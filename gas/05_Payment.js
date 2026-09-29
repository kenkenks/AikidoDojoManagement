// 05_Payment.gs
//   入金を受け付ける
//   入金ログを書く
//   請求の支払状態を更新する
/**
 * TODO:
 * payment_accept() は旧受付フローの入口。
 *
 * 旧:
 *   payment_accept()
 *     ↓
 *   06_入金ログ
 *
 * 新:
 *   createPaymentEvidenceRequestBatch()
 *     ↓
 *   09_決済エビデンス
 *     ↓
 *   recordPaymentEvidence()
 *     ↓
 *   postPaymentEvidence()
 *     ↓
 *   06_入金ログ
 *
 * 現在は互換性維持のため残置。
 * payment.html の移行完了後に削除予定。
 */

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

  const duplicated = daoPaymentExistsByDecisionId_(payment.決済ID, ctx);

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
  const invoiceRows = daoPaymentLoadInvoiceStatusRows_(ctx);

  if (invoiceRows.length === 0) {
    return {
      ok: true,
      message: "請求明細がありません。",
      updated: 0
    };
  }

  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedBillingGroupId = String(billingGroupId).trim();

  const paidTotal = payment_getPaidTotal(
    payments,
    normalizedTargetMonth,
    normalizedBillingGroupId
  );

  const targetInvoices = invoiceRows.filter(function(row) {
    return normalizeMonth(row.target_month) === normalizedTargetMonth &&
      String(row.billing_group_id).trim() === normalizedBillingGroupId;
  }).map(function(row) {
    return {
      rowNumber: row.rowNumber,
      invoice_id: row.invoice_id,
      amount: row.amount,
      current_status: row.current_status
    };
  });

  const allocations = payment_calculateInvoiceStatuses_(
    targetInvoices,
    payments.filter(function(payment) {
      return normalizeMonth(payment["target_month"]) === normalizedTargetMonth &&
        String(payment["billing_group_id"] || "").trim() === normalizedBillingGroupId;
    })
  );

  daoPaymentUpdateInvoiceStatuses_(allocations, ctx);
  const updated = allocations.length;

  return {
    ok: true,
    targetMonth: normalizedTargetMonth,
    billingGroupId: normalizedBillingGroupId,
    paidTotal,
    updated,
    allocations: allocations
  };
}

// invoice_id付き入金は、その請求だけへ充当する。
// 旧データとの互換用にinvoice_idなしの入金だけを請求順へ充当する。
function payment_calculateInvoiceStatuses_(invoices, payments) {
  const directPaidByInvoice = {};
  let legacyUnassignedTotal = 0;

  (payments || []).forEach(function(payment) {
    const invoiceId = normalizeId_(payment["invoice_id"]);
    const amount = Number(payment["入金額"] || payment["金額"] || 0);
    if (invoiceId) {
      directPaidByInvoice[invoiceId] = Number(directPaidByInvoice[invoiceId] || 0) + amount;
    } else {
      legacyUnassignedTotal += amount;
    }
  });

  return (invoices || []).map(function(invoice) {
    const invoiceId = normalizeId_(invoice.invoice_id);
    const plannedAmount = Number(invoice.amount || 0);
    const directPaid = Number(directPaidByInvoice[invoiceId] || 0);
    const remainingAfterDirect = Math.max(plannedAmount - directPaid, 0);
    const legacyApplied = Math.min(legacyUnassignedTotal, remainingAfterDirect);
    legacyUnassignedTotal -= legacyApplied;
    const appliedAmount = directPaid + legacyApplied;
    let status = appliedAmount >= plannedAmount ? "支払済" : "未払い";
    if (plannedAmount <= 0) status = "免除";
    if (String(invoice.current_status || "") === "取消") status = "取消";

    return {
      rowNumber: invoice.rowNumber,
      invoice_id: invoiceId,
      planned_amount: plannedAmount,
      applied_amount: appliedAmount,
      unpaid_amount: Math.max(plannedAmount - appliedAmount, 0),
      status: status
    };
  });
}

function validatePaymentMasterData_(ctx, teacherId, locationId, billingBlockId) {
  const teacher = getTeachers(ctx).find(row =>
    normalizeId_(row["teacher_id"]) === teacherId && isActiveMasterRow_(row)
  );
  if (!teacher) throw new Error("有効な先生が見つかりません。");
  if (!isTrueValue_(teacher["出席受付可"])) throw new Error("この先生は出席受付不可です。");

  validatePaymentScope_(ctx, locationId, billingBlockId);
}

function validatePaymentScope_(ctx, locationId, billingBlockId) {
  const location = getLocations(ctx).find(row =>
    normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row)
  );
  if (!location) throw new Error("有効な道場が見つかりません。");

  const block = getBillingBlocks(ctx).find(row =>
    normalizeId_(row["billing_block_id"]) === billingBlockId && isActiveMasterRow_(row)
  );
  if (!block || normalizeId_(block["location_id"]) !== locationId) {
    throw new Error("道場と課金枠の組み合わせが不正です。");
  }
}

// ==============================
// DAO
// ==============================
function payment_append(ctx, payment) {
  return daoPaymentAppend_(ctx, payment);
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
