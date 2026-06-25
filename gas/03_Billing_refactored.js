// 03_Billing.gs
//   請求を作る
//   請求額を決める

// ==============================
// 請求選択受付（メイン）
// ==============================
function billing_acceptMonthlySelection(memberId, plan_id, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());

  // ① 入力・関連情報を集める
  const billingContext =
    billing_collectMonthlySelectionContext(memberId, plan_id, ctx);

  // ② 04_月次選択へ登録する
  billing_registerMonthlySelection(billingContext, ctx);

  // ③ 請求明細用データを作る
  const invoice =
    billing_makeInvoice(billingContext);

  // ④ 05_請求明細へ登録する
  billing_appendInvoice(ctx, invoice);

  // ⑤ Viewを更新する
  const viewUpdate =
    paymentStatusView_refresh(
      billingContext.memberId,
      billingContext.targetMonth,
      ctx
    );

  return {
    ok: true,
    message: `${billingContext.targetMonth} の会費タイプを「${plan_id}」で登録しました。`,
    invoice,
    viewUpdate
  };
}

// ==============================
// 情報収集
// ==============================
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

  const targetMonth = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM"
  );

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

function billing_getMonthlySelection(billingGroupId, targetMonth, ctx) {
  ctx = ensureSheetContext(ctx);

  const monthlySelections = getMonthlySelections(ctx);
  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedBillingGroupId = String(billingGroupId).trim();

  return monthlySelections.find(row =>
    normalizeMonth(row["target_month"]) === normalizedTargetMonth &&
    String(row["billing_group_id"]).trim() === normalizedBillingGroupId
  ) || null;
}

// ==============================
// Invoice生成
// ==============================
function billing_makeInvoice(billingContext) {
  return makeInvoice(
    billingContext.targetMonth,
    billingContext.billingGroupId,
    billingContext.memberId,
    billingContext.plan_id,
    billingContext.invoiceType,
    billingContext.invoiceName,
    billingContext.quantity,
    billingContext.unitPrice,
    billingContext.monthlyCap
  );
}

function makeInvoice(targetMonth, billingGroupId, memberId, planId, type, name, quantity, unitPrice, monthlyCap) {
  const now = new Date();
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
// Register
// ==============================
function billing_registerMonthlySelection(billingContext, ctx) {
  billing_appendMonthlySelection(ctx, {
    target_month: billingContext.targetMonth,
    member_id: billingContext.memberId,
    billing_group_id: billingContext.billingGroupId,
    plan_id: billingContext.plan_id,
    宣言日: new Date(),
    状態: "有効",
    備考: ""
  });
}

// ==============================
// DAO
// ==============================
function billing_appendMonthlySelection(ctx, selection) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("04_月次選択");

  appendObjectsByHeader_(sheet, [{
    target_month: selection.target_month,
    member_id: selection.member_id,
    billing_group_id: selection.billing_group_id,
    plan_id: selection.plan_id,
    宣言日: selection.宣言日 || new Date(),
    状態: selection.状態 || "有効",
    備考: selection.備考 || ""
  }]);

  invalidateMonthlySelections(ctx);
}

function billing_appendInvoice(ctx, invoice) {
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
    支払期限: invoice.支払期限 || "",
    作成日: invoice.作成日 || new Date(),
    備考: invoice.備考 || ""
  }]);

  invalidateInvoices(ctx);
}

// ==============================
// 互換ラッパー
// ==============================
function appendMonthlyBillingSelection(memberId, plan_id) {
  try {
    return billing_acceptMonthlySelection(memberId, plan_id, createSheetContext());
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function getMonthlySelection(billingGroupId, targetMonth, ctx) {
  return billing_getMonthlySelection(billingGroupId, targetMonth, ctx);
}

function registerMonthlyBillingSelection(ctx, targetMonth, memberId, billingGroupId, plan_id) {
  return billing_registerMonthlySelection({
    targetMonth,
    memberId,
    billingGroupId,
    plan_id
  }, ctx);
}

function appendInvoice(ctx, invoice) {
  return billing_appendInvoice(ctx, invoice);
}
