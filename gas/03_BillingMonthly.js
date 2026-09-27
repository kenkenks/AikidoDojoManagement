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
 * Make Monthly Selection
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
function billingMonthlyAccept(memberId, plan_id, ctx, options) {
  ctx = daoContext_(ctx || createSheetContext());
  options = options || {};
  const deferViewRefresh = options.deferViewRefresh === true;
  try {
    const facts = billingMonthlyCollect(memberId, plan_id, ctx);
    let invoice = null;
    if (facts.alreadySelected !== true) {
      // 保存順・時刻取得順・途中失敗時の保存済みデータを維持する。
      const selection = billingMonthlyMakeSelection_(facts, ctx);
      billingMonthlyRecordSelection_(selection, ctx);
      invoice = billingCoreMakeInvoice_(facts, ctx);
      billingMonthlyRecordInvoice_(invoice, ctx);
    }
    const viewUpdate = billingMonthlyPost_(facts, deferViewRefresh, ctx);
    const skipped = facts.alreadySelected === true;
    return {
      ok: true, skipped: skipped, idempotent: skipped,
      message: skipped
        ? facts.targetMonth + ' の会費タイプ「' + plan_id + '」は登録済みです。'
        : facts.targetMonth + ' の会費タイプを「' + plan_id + '」で登録しました。',
      invoice: invoice, viewUpdate: viewUpdate
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function billingMonthlyPost_(facts, deferViewRefresh, ctx) {
  return deferViewRefresh
    ? { ok: true, deferred: true, row_updated: false, reason: "DEFERRED_BY_CALLER" }
    : paymentStatusView_refresh(facts.memberId, facts.targetMonth, ctx);
}

function billingMonthlyRecordSelection_(selection, ctx) {
  return billingRecordAppendMonthlySelection_(selection, ctx);
}

function billingMonthlyRecordInvoice_(invoice, ctx) {
  return billingRecordAppendInvoice_(invoice, ctx);
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
  ctx = daoContext_(ctx);

  if (!memberId) {
    throw new Error("memberId がありません。");
  }

  if (!planId) {
    throw new Error("plan_id がありません。");
  }

  const member = daoBillingFindMonthlyMember_(memberId, ctx);

  if (!member) {
    throw new Error("会員が見つかりません。");
  }

  const billingGroupId = String(member["請求グループID"] || "").trim();
  if (!billingGroupId) {
    throw new Error("請求グループIDがありません。");
  }

  const targetMonth = sup_targetMonth(ctx);

  const existing = daoBillingFindMonthlySelection_(billingGroupId, targetMonth, ctx);
  const requestedPlanId = String(planId).trim();
  if (existing) {
    const existingPlanId = String(existing["plan_id"] || "").trim();

    // 同じ宣言の再要求は、画面再表示・再送・E2E再利用経路で起こり得る。
    // 副作用を増やさず成功扱いにする。
    if (existingPlanId === requestedPlanId) {
      return {
        targetMonth,
        memberId,
        billingGroupId,
        plan_id: requestedPlanId,
        alreadySelected: true,
        existingSelection: existing
      };
    }

    // 別planへの変更は暗黙に行わない。
    throw new Error(
      `今月の会費タイプはすでに「${existingPlanId || "不明"}」で登録済みです。`
    );
  }

  const fee = daoBillingFindMonthlyFee_(planId, ctx);

  if (!fee) {
    throw new Error("料金プランが見つかりません。");
  }

  return {
    targetMonth,
    memberId,
    billingGroupId,
    plan_id: planId,
    alreadySelected: false,
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
  return billingMonthlyRecordSelection_(billingMonthlyMakeSelection_(billingContext, ctx), ctx);
}

function billingMonthlyMakeSelection_(billingContext, ctx) {
  return {
    target_month: billingContext.targetMonth,
    member_id: billingContext.memberId,
    billing_group_id: billingContext.billingGroupId,
    plan_id: billingContext.plan_id,
    宣言日: sup_now(ctx),
    状態: "有効",
    備考: ""
  };
}
