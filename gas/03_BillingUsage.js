/**
 * ROLE
 * BillingUsageService
 *
 * RESPONSIBILITY
 * 回数料金（都度）の請求予定額を、対象月の有効な出席事実から再計算して同期する。
 *
 * DESIGN
 * - 04_月次選択の冪等性とは独立して動く。
 * - 「現在額 + 1回分」ではなく出席事実から再計算するため、再送しても増殖しない。
 * - 月額上限を billingCoreMakeInvoiceObject_ と同じ規則で適用する。
 * - collect → make → record → post。出席集計とView内部のDAO移行は後続。
 * - Monthly側に同名の旧定義が残るため、配備前に読み込み順を確認する。
 */
function billingUsageSyncFromAttendance_(memberId, targetMonth, ctx) {
  ctx = daoContext_(ctx);
  const facts = billingUsageCollect_(memberId, targetMonth, ctx);
  const prepared = billingUsageMake_(facts);
  billingUsageRecord_(prepared, ctx);
  return billingUsagePost_(prepared, ctx);
}

// 照会は従来の順番で行う。対象外なら後続の照会を省略する。
function billingUsageCollect_(memberId, targetMonth, ctx) {

  memberId = normalizeId_(memberId);
  targetMonth = normalizeMonth(targetMonth || sup_targetMonth(ctx));
  if (!memberId || !targetMonth) {
    return { ok: false, message: "memberId / targetMonth がありません。" };
  }

  const member = daoBillingFindActiveMember_(memberId, ctx);
  if (!member) return { ok: false, message: "有効な会員が見つかりません: " + memberId };

  const billingGroupId = normalizeId_(member["請求グループID"]);
  const selection = daoBillingFindMonthlySelection_(billingGroupId, targetMonth, ctx);
  if (!selection) {
    return { ok: true, skipped: true, message: "対象月の会費タイプが未選択です。" };
  }

  const planId = normalizeId_(selection["plan_id"]);
  const fee = daoBillingFindActiveFee_(planId, ctx);
  if (!fee) return { ok: false, message: "料金プランが見つかりません: " + planId };

  // 回数料金だけが出席のたびに累積請求を更新する。
  if (String(fee["会費タイプ"] || "").trim() !== "回数料金") {
    return { ok: true, skipped: true, plan_id: planId, message: "回数料金ではないため同期対象外です。" };
  }

  const charge = calculateAttendanceChargeCount(memberId, targetMonth, ctx);
  const invoice = daoBillingFindUsageInvoice_(billingGroupId, planId, targetMonth, ctx);
  if (!invoice) {
    return { ok: false, message: "同期対象の請求明細が見つかりません。" };
  }

  const invoiceId = normalizeId_(invoice["invoice_id"]);
  const payments = daoBillingFindInvoicePayments_(invoiceId, ctx);
  return { memberId, targetMonth, planId, invoiceId, charge, fee, payments };
}

function billingUsageMake_(facts) {
  if (Object.prototype.hasOwnProperty.call(facts, 'ok')) return { result: facts };
  const { memberId, targetMonth, planId, invoiceId, charge, fee, payments } = facts;
  const quantity = Number(charge && charge.charge_count || 0);
  const unitPrice = Number(fee["回数単価"] || 0);
  const monthlyCap = Number(fee["上限金額"] || 0);
  const calculatedAmount = quantity * unitPrice;
  const plannedAmount = monthlyCap > 0 ? Math.min(calculatedAmount, monthlyCap) : calculatedAmount;

  const paidTotal = payments.reduce(function(sum, row) {
    return sum + Number(row["入金額"] || 0);
  }, 0);

  const status = plannedAmount <= 0 ? "免除" : (paidTotal >= plannedAmount ? "支払済" : "未払い");
  const values = {
    数量: quantity,
    単価: unitPrice,
    上限金額: monthlyCap,
    計算額: calculatedAmount,
    請求予定額: plannedAmount,
    金額: plannedAmount,
    支払状態: status
  };
  const result = {
    ok: true,
    skipped: false,
    member_id: memberId,
    plan_id: planId,
    invoice_id: invoiceId,
    charge_count: quantity,
    unit_price: unitPrice,
    monthly_cap: monthlyCap,
    planned_amount: plannedAmount,
    paid_total: paidTotal,
    unpaid_amount: Math.max(plannedAmount - paidTotal, 0),
    message: "回数料金の請求予定額を出席実績から同期しました。"
  };
  return { invoiceId, memberId, targetMonth, values, result, charge };
}

function billingUsageRecord_(prepared, ctx) {
  if (prepared.values) billingRecordUpdateUsageInvoice_(prepared.invoiceId, prepared.values, ctx);
}

function billingUsagePost_(prepared, ctx) {
  if (!prepared.values) return prepared.result;
  prepared.result.viewUpdate = paymentStatusView_refresh(prepared.memberId, prepared.targetMonth, ctx);
  // 既存の例外タイミングも維持するため、出席明細の展開は保存・View更新後。
  prepared.result.attendance_details = prepared.charge.details || [];
  return prepared.result;
}
