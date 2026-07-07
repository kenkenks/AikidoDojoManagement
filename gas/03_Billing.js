// ==============================
// 請求選択受付（メイン）
// ==============================
// 03_Billing.gs
//   請求を作る
//   請求額を決める
/**
 * ROLE
 * BillingMonthlyService
 *
 * RESPONSIBILITY
 * 月額請求受付の入口。
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
 * 現時点では月額請求受付のオーケストレーター。
 * 将来的には billingMonthlyAccept() へリネーム候補。
 */

/**
 * LEGACY COMPATIBILITY
 *
 * 旧入口。
 *
 * 新規実装では
 * billingMonthlyAccept()
 * を使用すること。
 */
function billing_acceptMonthlySelection(memberId, plan_id, ctx) {
  return billingMonthlyAccept(memberId, plan_id, ctx);
}

// ==============================
// 情報収集
// ==============================
/**
 * LEGACY COMPATIBILITY
 *
 * 新規実装では
 * billingMonthlyCollect()
 * を使用すること。
 */
function billing_collectMonthlySelectionContext(memberId, plan_id, ctx) {
  return billingMonthlyCollect(memberId, plan_id, ctx);
}

/**
 * LEGACY COMPATIBILITY
 *
 * 新規実装では
 * billingCoreMakeInvoice_()
 * を使用すること。
 */
function billing_makeInvoice(billingContext, ctx) {
  return billingCoreMakeInvoice_(billingContext, ctx);
}

/**
 * ROLE
 *
 * RESPONSIBILITY
 * 請求明細オブジェクトを生成する。
 *
 * DESIGN
 * 請求金額は quantity * unitPrice を基本とし、
 * monthlyCap がある場合は上限を適用する。
 *
 * amount = 0 の場合も正当な請求結果として扱い、
 * 支払状態は「免除」とする。
 *
 * NOTE
 * 汎用名すぎるため、将来的には
 * billingCoreMakeInvoiceObject_()
 * へリネーム候補。
 */

// ==============================
// Register
// ==============================

/**
 * LEGACY COMPATIBILITY
 *
 * 新規実装では
 * billingCoreGetMonthlySelection_()
 * を使用すること。
 */
function billing_getMonthlySelection(billingGroupId, targetMonth, ctx) {
  return billingCoreGetMonthlySelection_(billingGroupId, targetMonth, ctx);
}

// ==============================
// 互換ラッパー
// ==============================
function appendMonthlyBillingSelection(memberId, plan_id, ctx) {
  try {
    return billing_acceptMonthlySelection(memberId, plan_id, createSheetContext(),ctx);
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function getMonthlySelection(billingGroupId, targetMonth, ctx) {
  return billing_getMonthlySelection(billingGroupId, targetMonth, ctx);
}

// 未使用
function registerMonthlyBillingSelection(targetMonth, memberId, billingGroupId, plan_id, ctx) {
  return billing_registerMonthlySelection({
    targetMonth,
    memberId,
    billingGroupId,
    plan_id
  }, ctx);
}

function appendInvoice(invoice, ctx) {
  return billing_appendInvoice(invoice, ctx);
}

/**
 * LEGACY COMPATIBILITY
 *
 * 新規実装では
 * billingRecordAppendInvoice_()
 * を使用すること。
 */
function billing_appendInvoice(invoice, ctx) {
  return billingRecordAppendInvoice_(invoice, ctx);
}

/**
 * LEGACY COMPATIBILITY
 *
 * 新規実装では
 * billingMonthlyRegisterSelection_()
 * を使用すること。
 */
function billing_registerMonthlySelection(billingContext, ctx) {
  return billingMonthlyRegisterSelection_(billingContext, ctx);
}

/**
 * LEGACY COMPATIBILITY
 *
 * 新規実装では
 * billingRecordAppendMonthlySelection_()
 * を使用すること。
 */
function billing_appendMonthlySelection(selection, ctx) {
  return billingRecordAppendMonthlySelection_(selection, ctx);
}