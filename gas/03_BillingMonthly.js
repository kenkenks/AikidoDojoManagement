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
      billing_collectMonthlySelectionContext(memberId, plan_id, ctx);

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