// ==============================
// DAO BUSINESS: 請求の論理データ契約。物理Sheet操作はDAO_Core_Sheetsへ委譲。
// ==============================
/**
 * ROLE
 * BillingRecord
 *
 * RESPONSIBILITY
 * 04_月次選択へ行追加する。
 *
 * NOTE
 * 将来的にはRepository候補。
 */
function billing_appendMonthlySelection(selection, ctx) {
  ctx = daoContext_(ctx);

  daoCore_(ctx).append("monthlySelections", [{
    target_month: selection.target_month,
    member_id: selection.member_id,
    billing_group_id: selection.billing_group_id,
    plan_id: selection.plan_id,
    宣言日: selection.宣言日 || sup_now(ctx),
    状態: selection.状態 || "有効",
    備考: selection.備考 || ""
  }], ctx);
}

/**
 * ROLE
 * BillingRecord
 *
 * RESPONSIBILITY
 * 05_請求明細へ請求明細行を追加する。
 *
 * NOTE
 * 将来的にはRepository候補。
 */
function billingRecordAppendInvoice_(invoice, ctx) {
  return daoPortableInvoice_append_(invoice, ctx);
}

/**
 * ROLE
 * BillingRecord
 *
 * RESPONSIBILITY
 * 04_月次選択へ月次選択行を追加する。
 *
 * NOTE
 * 将来的にはRepository候補。
 */
function billingRecordAppendMonthlySelection_(selection, ctx) {
  ctx = daoContext_(ctx);

  return daoPortableMonthlySelection_append_( {
    target_month: selection.target_month,
    member_id: selection.member_id,
    billing_group_id: selection.billing_group_id,
    plan_id: selection.plan_id,
    宣言日: selection.宣言日 || sup_now(ctx),
    状態: selection.状態 || "有効",
    備考: selection.備考 || ""
  }, ctx);
}

/**
 * ROLE
 * BillingRecord
 *
 * RESPONSIBILITY
 * 既存の回数料金請求を、出席実績から再計算した累積値へ同期する。
 */
function billingRecordUpdateUsageInvoice_(invoiceId, values, ctx) {
  const result = daoCore_(ctx).updateByKey('invoices', 'invoice_id', invoiceId, values, ctx);
  if (!result.found) throw new Error('更新対象の請求明細が見つかりません: ' + invoiceId);
}

