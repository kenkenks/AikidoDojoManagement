// ==============================
// DAO
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
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("04_月次選択");

  appendObjectsByHeader_(sheet, [{
    target_month: selection.target_month,
    member_id: selection.member_id,
    billing_group_id: selection.billing_group_id,
    plan_id: selection.plan_id,
    宣言日: selection.宣言日 || sup_now(ctx),
    状態: selection.状態 || "有効",
    備考: selection.備考 || ""
  }]);

  invalidateMonthlySelections(ctx);
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
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("05_請求明細");

  appendObjectsByHeader_(sheet, [{
    invoice_id: invoice.invoice_id,
    target_month: invoice.target_month,
    billing_group_id: invoice.billing_group_id,
    member_id: invoice.member_id,
    plan_id: invoice.plan_id,
    請求種別: invoice.請求種別,
    表示名: invoice.表示名,
    数量: invoice.数量,
    単価: invoice.単価,
    上限金額: invoice.上限金額,
    計算額: invoice.計算額,
    請求予定額: invoice.請求予定額,
    金額: invoice.金額,
    支払状態: invoice.支払状態,
    支払期限: invoice.支払期限,
    作成日: invoice.作成日,
    備考: invoice.備考
  }]);

  invalidateInvoices(ctx);
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
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("04_月次選択");

  appendObjectsByHeader_(sheet, [{
    target_month: selection.target_month,
    member_id: selection.member_id,
    billing_group_id: selection.billing_group_id,
    plan_id: selection.plan_id,
    宣言日: selection.宣言日 || sup_now(ctx),
    状態: selection.状態 || "有効",
    備考: selection.備考 || ""
  }]);

  invalidateMonthlySelections(ctx);
}