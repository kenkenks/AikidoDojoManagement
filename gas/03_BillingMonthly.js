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

    // 同じ月・同じ請求グループ・同じplan_idの再要求は冪等成功とする。
    // PayPay画面の再表示や既存REQUESTED再利用時に、同じ宣言を
    // 「登録済みエラー」として止めない。
    if (billingContext.alreadySelected === true) {
      viewUpdate =
        paymentStatusView_refresh(
          billingContext.memberId,
          billingContext.targetMonth,
          ctx
        );

      return {
        ok: true,
        skipped: true,
        idempotent: true,
        message: `${billingContext.targetMonth} の会費タイプ「${plan_id}」は登録済みです。`,
        invoice: null,
        viewUpdate
      };
    }

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
    skipped: false,
    idempotent: false,
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
/**
 * ROLE
 * BillingUsage / Attendance Sync
 *
 * RESPONSIBILITY
 * 都度プランの請求予定額を、当月の有効な課金対象出席回数から再計算する。
 * 04_月次選択の冪等性とは独立して実行する。
 */
function billingUsageSyncFromAttendance_(memberId, planId, ctx) {
  ctx = ensureSheetContext(ctx);

  const fee = getFees(ctx).find(function(row) {
    return normalizeId_(row["plan_id"]) === normalizeId_(planId);
  });
  if (!fee) throw new Error("料金プランが見つかりません: " + planId);

  const feeType = String(fee["会費タイプ"] || "").trim();
  if (feeType.indexOf("都度") < 0 && normalizeId_(planId) !== "P002") {
    return { ok: true, skipped: true, reason: "NOT_USAGE_PLAN" };
  }

  const member = getMembers(ctx).find(function(row) {
    return normalizeId_(row["member_id"]) === normalizeId_(memberId) && isActiveMasterRow_(row);
  });
  if (!member) throw new Error("有効な会員が見つかりません: " + memberId);

  const targetMonth = sup_targetMonth(ctx);
  const billingGroupId = normalizeId_(member["請求グループID"]);
  const chargeCount = calculateAttendanceChargeCount(memberId, targetMonth, ctx).charge_count;
  const unitPrice = Number(fee["回数単価"] || 0);
  const monthlyCap = Number(fee["上限金額"] || 0);
  const calculatedAmount = chargeCount * unitPrice;
  const plannedAmount = monthlyCap > 0 ? Math.min(calculatedAmount, monthlyCap) : calculatedAmount;

  const invoice = getInvoices(ctx).find(function(row) {
    return normalizeMonth(row["target_month"]) === normalizeMonth(targetMonth) &&
      normalizeId_(row["billing_group_id"]) === billingGroupId &&
      normalizeId_(row["plan_id"]) === normalizeId_(planId);
  });
  if (!invoice) throw new Error("都度課金の請求明細が見つかりません: " + memberId);

  const currentAmount = Number(invoice["請求予定額"] || invoice["金額"] || 0);
  if (currentAmount === plannedAmount && Number(invoice["数量"] || 0) === chargeCount) {
    return { ok: true, skipped: true, reason: "ALREADY_SYNCED", charge_count: chargeCount, planned_amount: plannedAmount };
  }

  const paidTotal = payment_getPaidTotal(getPayments(ctx), normalizeMonth(targetMonth), billingGroupId);
  const paymentStatus = plannedAmount === 0 ? "免除" : (paidTotal >= plannedAmount ? "支払済" : "未払い");

  billingRecordUpdateInvoice_(invoice["invoice_id"], {
    "数量": chargeCount,
    "単価": unitPrice,
    "上限金額": monthlyCap,
    "計算額": calculatedAmount,
    "請求予定額": plannedAmount,
    "金額": plannedAmount,
    "支払状態": paymentStatus
  }, ctx);

  paymentStatusView_refresh(memberId, targetMonth, ctx);
  return { ok: true, skipped: false, charge_count: chargeCount, planned_amount: plannedAmount };
}
