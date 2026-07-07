function billingCoreMakeInvoiceObject_(targetMonth, billingGroupId, memberId, planId, type, name, quantity, unitPrice, monthlyCap, ctx) {
  const now = sup_now(ctx);
  const invoiceId = `INV-${targetMonth}-${billingGroupId}-${memberId || "GROUP"}-${Utilities.getUuid().slice(0, 8)}`;

  quantity = quantity === undefined || quantity === null || quantity === ""
    ? 1
    : Number(quantity);

  unitPrice = unitPrice === undefined || unitPrice === null || unitPrice === ""
    ? 0
    : Number(unitPrice);

  monthlyCap = monthlyCap === undefined || monthlyCap === null || monthlyCap === ""
    ? 0
    : Number(monthlyCap);

  const calculatedAmount = quantity * unitPrice;
  const plannedAmount =
    monthlyCap > 0
      ? Math.min(calculatedAmount, monthlyCap)
      : calculatedAmount;

  const amount = plannedAmount;

  return {
    invoice_id: invoiceId,
    target_month: targetMonth,
    billing_group_id: billingGroupId,
    member_id: memberId,
    plan_id: planId,
    請求種別: type,
    表示名: name,
    数量: quantity,
    単価: unitPrice,
    上限金額: monthlyCap,
    計算額: calculatedAmount,
    請求予定額: plannedAmount,
    金額: amount,
    支払状態: amount === 0 ? "免除" : "未払い",
    支払期限: "",
    作成日: now,
    備考: ""
  };
}

// ==============================
// Invoice生成
// ==============================
/**
 * ROLE
 * BillingCore / Make
 *
 * RESPONSIBILITY
 * BillingContext から請求明細DTOを生成する。
 *
 * NOTE
 * 月額・回数・ビジター等で共通利用する請求生成処理。
 */
function billingCoreMakeInvoice_(billingContext, ctx) {
  return billingCoreMakeInvoiceObject_(
    billingContext.targetMonth,
    billingContext.billingGroupId,
    billingContext.memberId,
    billingContext.plan_id,
    billingContext.invoiceType,
    billingContext.invoiceName,
    billingContext.quantity,
    billingContext.unitPrice,
    billingContext.monthlyCap,
    ctx
  );
}

/**
 * ROLE
 * BillingCore / Query
 *
 * RESPONSIBILITY
 * 指定された請求グループ・対象月の月次選択を取得する。
 *
 * NOTE
 * BillingMonthly / BillingUsage などから共通利用する。
 */
function billingCoreGetMonthlySelection_(billingGroupId, targetMonth, ctx) {
  ctx = ensureSheetContext(ctx);

  const monthlySelections = getMonthlySelections(ctx);
  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedBillingGroupId = String(billingGroupId).trim();

  return monthlySelections.find(row =>
    normalizeMonth(row["target_month"]) === normalizedTargetMonth &&
    String(row["billing_group_id"]).trim() === normalizedBillingGroupId
  ) || null;
}

