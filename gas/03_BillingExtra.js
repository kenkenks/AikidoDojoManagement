// ========================================
// 03_BillingExtra.js
// 審査費など月会費以外の追加請求
// ========================================

function billingExtraEnsureInvoice(memberId, planId, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());

  const normalizedMemberId = normalizeId_(memberId);
  const normalizedPlanId = normalizeId_(planId);
  if (!normalizedMemberId || !normalizedPlanId) {
    return { ok: false, message: "会員IDと料金プランIDが必要です。" };
  }

  const member = getMembers(ctx).find(function(row) {
    return normalizeId_(row["member_id"]) === normalizedMemberId && isActiveMasterRow_(row);
  });
  if (!member) return { ok: false, message: "有効な会員が見つかりません。" };

  const fee = getFees(ctx).find(function(row) {
    return normalizeId_(row["plan_id"]) === normalizedPlanId && isActiveMasterRow_(row);
  });
  if (!fee) return { ok: false, message: "料金プランが見つかりません。" };

  const billingType = String(fee["会費タイプ"] || "").trim();
  if (billingType !== "審査費") {
    return { ok: false, message: "追加請求対象の料金プランではありません。" };
  }

  const targetMonth = sup_targetMonth(ctx);
  const billingGroupId = normalizeId_(member["請求グループID"]);
  if (!billingGroupId) return { ok: false, message: "請求グループIDがありません。" };

  const existing = getInvoices(ctx).find(function(row) {
    return normalizeMonth(row["target_month"]) === targetMonth &&
      normalizeId_(row["member_id"]) === normalizedMemberId &&
      normalizeId_(row["plan_id"]) === normalizedPlanId &&
      String(row["支払状態"] || "") !== "取消";
  });

  if (existing) {
    return { ok: true, created: false, invoice: existing, message: "審査費は登録済みです。" };
  }

  const invoice = billingCoreMakeInvoiceObject_(
    targetMonth,
    billingGroupId,
    normalizedMemberId,
    normalizedPlanId,
    billingType,
    String(fee["表示名"] || normalizedPlanId),
    1,
    Number(fee["回数単価"] || fee["金額"] || 0),
    0,
    ctx
  );

  billingRecordAppendInvoice_(invoice, ctx);
  paymentStatusView_refresh(normalizedMemberId, targetMonth, ctx);

  return { ok: true, created: true, invoice: invoice, message: "審査費を請求へ追加しました。" };
}
