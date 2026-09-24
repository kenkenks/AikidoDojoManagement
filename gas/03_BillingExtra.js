// 審査費追加請求: collect → make → record → post。
function billingExtraEnsureInvoice(memberId, planId, ctx) {
  ctx = daoContext_(ctx || createSheetContext());
  const collected = billingExtraCollect_(memberId, planId, ctx);
  const prepared = billingExtraMake_(collected, ctx);
  const recorded = billingExtraRecord_(prepared, ctx);
  return billingExtraPost_(recorded, ctx);
}

function billingExtraCollect_(memberId, planId, ctx) {
  const facts = { memberId: normalizeId_(memberId), planId: normalizeId_(planId) };
  // 不足した参照の先を読まない。拒否結果の決定はmakeが所有する。
  if (!facts.memberId || !facts.planId) return facts;
  facts.member = daoBillingFindActiveMember_(facts.memberId, ctx);
  if (!facts.member) return facts;
  facts.fee = daoBillingFindActiveFee_(facts.planId, ctx);
  if (!facts.fee || String(facts.fee['会費タイプ'] || '').trim() !== '審査費') return facts;
  facts.targetMonth = sup_targetMonth(ctx);
  facts.billingGroupId = normalizeId_(facts.member['請求グループID']);
  if (!facts.billingGroupId) return facts;
  facts.existing = daoBillingFindOpenExtraInvoice_(facts.memberId, facts.planId, facts.targetMonth, ctx);
  return facts;
}

function billingExtraMake_(facts, ctx) {
  if (!facts.memberId || !facts.planId) return { ok: false, message: '会員IDと料金プランIDが必要です。' };
  if (!facts.member) return { ok: false, message: '有効な会員が見つかりません。' };
  if (!facts.fee) return { ok: false, message: '料金プランが見つかりません。' };
  const billingType = String(facts.fee['会費タイプ'] || '').trim();
  if (billingType !== '審査費') return { ok: false, message: '追加請求対象の料金プランではありません。' };
  if (!facts.billingGroupId) return { ok: false, message: '請求グループIDがありません。' };
  if (facts.existing) return { ok: true, created: false, invoice: facts.existing, message: '審査費は登録済みです。' };
  const invoice = billingCoreMakeInvoiceObject_(
    facts.targetMonth, facts.billingGroupId, facts.memberId, facts.planId,
    billingType, String(facts.fee['表示名'] || facts.planId), 1,
    Number(facts.fee['回数単価'] || facts.fee['金額'] || 0), 0, ctx
  );
  return { ok: true, created: true, invoice: invoice, message: '審査費を請求へ追加しました。' };
}

function billingExtraRecord_(prepared, ctx) {
  if (prepared.ok && prepared.created) billingRecordAppendInvoice_(prepared.invoice, ctx);
  return prepared;
}

function billingExtraPost_(recorded, ctx) {
  if (recorded.ok && recorded.created) {
    paymentStatusView_refresh(recorded.invoice.member_id, recorded.invoice.target_month, ctx);
  }
  return recorded;
}
