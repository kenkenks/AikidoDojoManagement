/**
 * ROLE
 * BillingMonthlyService
 *
 * RESPONSIBILITY
 * 月額請求受付の正式入口。
 *
 * FLOW
 * Collect
 *   ↓
 * Record Monthly Selection
 *   ↓
 * Make Invoice
 *   ↓
 * Record Invoice
 *   ↓
 * Refresh Payment Status View
 *
 * NOTE
 * billing_acceptMonthlySelection() は旧互換入口として残す。
 */
function billingMonthlyAccept(memberId, plan_id, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());

  let billingContext;
  let invoice;
  let viewUpdate;

  try {
    // Collect
    billingContext =
    billingMonthlyCollect(memberId, plan_id, ctx);

    // Record Monthly Selection
    billingMonthlyRegisterSelection_(billingContext, ctx);

    // Make Invoice
    invoice =
      billingCoreMakeInvoice_(billingContext, ctx);

    // Record Invoice
    billingRecordAppendInvoice_(invoice, ctx);

    // Refresh View
    viewUpdate =
      paymentStatusView_refresh(
        billingContext.memberId,
        billingContext.targetMonth,
        ctx
      );

  } catch (e) {
    return { ok: false, message: e.message };
  }

  return {
    ok: true,
    message: `${billingContext.targetMonth} の会費タイプを「${plan_id}」で登録しました。`,
    invoice,
    viewUpdate
  };
}

/**
 * ROLE
 * BillingMonthlyService / Collect
 *
 * RESPONSIBILITY
 * 月額請求受付に必要な情報を収集する。
 *
 * OUTPUT
 * BillingContext
 */
function billingMonthlyCollect(memberId, planId, ctx) {
  ctx = ensureSheetContext(ctx);

  if (!memberId) {
    throw new Error("memberId がありません。");
  }

  if (!planId) {
    throw new Error("plan_id がありません。");
  }

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

  const targetMonth = sup_targetMonth(ctx);

  const existing = billingCoreGetMonthlySelection_(billingGroupId, targetMonth, ctx);
  if (existing) {
    throw new Error("今月の会費タイプはすでに登録済みです。");
  }

  const fees = getFees(ctx);
  const fee = fees.find(f =>
    String(f["plan_id"]).trim() === String(planId).trim()
  );

  if (!fee) {
    throw new Error("料金プランが見つかりません。");
  }

  return {
    targetMonth,
    memberId,
    billingGroupId,
    plan_id: planId,
    invoiceType: fee["会費タイプ"],
    invoiceName: fee["表示名"],
    quantity: 1,
    unitPrice: Number(fee["回数単価"] || 0),
    monthlyCap: Number(fee["上限金額"] || 0)
  };
}
/**
 * ROLE
 * BillingMonthlyService
 *
 * RESPONSIBILITY
 * 月次選択登録用DTOを生成し、BillingRecordへ記録を依頼する。
 *
 * NOTE
 * 月額請求受付に固有の処理。
 */
function billingMonthlyRegisterSelection_(billingContext, ctx) {
  return billingRecordAppendMonthlySelection_({
    target_month: billingContext.targetMonth,
    member_id: billingContext.memberId,
    billing_group_id: billingContext.billingGroupId,
    plan_id: billingContext.plan_id,
    宣言日: sup_now(ctx),
    状態: "有効",
    備考: ""
  }, ctx);
}