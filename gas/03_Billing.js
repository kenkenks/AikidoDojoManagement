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
 * ROLE
 * BillingMonthlyService / Collect
 *
 * RESPONSIBILITY
 * 月額請求受付に必要な会員・請求グループ・料金プラン情報を収集する。
 *
 * NOTE
 * 月額用Collect。
 * 回数料金では別Collectを用意し、
 * Reconcile / Make / Record は共通化する方針。
 */
function billing_collectMonthlySelectionContext(memberId, plan_id, ctx) {
  ctx = ensureSheetContext(ctx);

  if (!memberId) {
    throw new Error("memberId がありません。");
  }

  if (!plan_id) {
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

  const existing = billing_getMonthlySelection(billingGroupId, targetMonth, ctx);
  if (existing) {
    throw new Error("今月の会費タイプはすでに登録済みです。");
  }

  const fees = getFees(ctx);
  const fee = fees.find(f =>
    String(f["plan_id"]).trim() === String(plan_id).trim()
  );

  if (!fee) {
    throw new Error("料金プランが見つかりません。");
  }

  return {
    targetMonth,
    memberId,
    billingGroupId,
    plan_id,
    invoiceType: fee["会費タイプ"],
    invoiceName: fee["表示名"],
    quantity: 1,
    unitPrice: Number(fee["回数単価"] || 0),
    monthlyCap: Number(fee["上限金額"] || 0)
  };
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
 * BillingCore / Make
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
 * ROLE
 * BillingRecord
 *
 * RESPONSIBILITY
 * 月次選択を04_月次選択へ記録する。
 */
function billing_registerMonthlySelection(billingContext, ctx) {
  billing_appendMonthlySelection({
    target_month: billingContext.targetMonth,
    member_id: billingContext.memberId,
    billing_group_id: billingContext.billingGroupId,
    plan_id: billingContext.plan_id,
    宣言日: sup_now(ctx),
    状態: "有効",
    備考: ""
  }, ctx);
}



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