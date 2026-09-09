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
 */
function billingUsageSyncFromAttendance_(memberId, targetMonth, ctx) {
  ctx = ensureSheetContext(ctx);

  memberId = normalizeId_(memberId);
  targetMonth = normalizeMonth(targetMonth || sup_targetMonth(ctx));
  if (!memberId || !targetMonth) {
    return { ok: false, message: "memberId / targetMonth がありません。" };
  }

  const member = getMembers(ctx).find(function(row) {
    return isActiveMasterRow_(row) && normalizeId_(row["member_id"]) === memberId;
  });
  if (!member) return { ok: false, message: "有効な会員が見つかりません: " + memberId };

  const billingGroupId = normalizeId_(member["請求グループID"]);
  const selection = billingCoreGetMonthlySelection_(billingGroupId, targetMonth, ctx);
  if (!selection) {
    return { ok: true, skipped: true, message: "対象月の会費タイプが未選択です。" };
  }

  const planId = normalizeId_(selection["plan_id"]);
  const fee = getFees(ctx).find(function(row) {
    return isActiveMasterRow_(row) && normalizeId_(row["plan_id"]) === planId;
  });
  if (!fee) return { ok: false, message: "料金プランが見つかりません: " + planId };

  // 回数料金だけが出席のたびに累積請求を更新する。
  if (String(fee["会費タイプ"] || "").trim() !== "回数料金") {
    return { ok: true, skipped: true, plan_id: planId, message: "回数料金ではないため同期対象外です。" };
  }

  const charge = calculateAttendanceChargeCount(memberId, targetMonth, ctx);
  const quantity = Number(charge && charge.charge_count || 0);
  const unitPrice = Number(fee["回数単価"] || 0);
  const monthlyCap = Number(fee["上限金額"] || 0);
  const calculatedAmount = quantity * unitPrice;
  const plannedAmount = monthlyCap > 0 ? Math.min(calculatedAmount, monthlyCap) : calculatedAmount;

  const invoice = getInvoices(ctx).find(function(row) {
    return normalizeMonth(row["target_month"]) === targetMonth &&
      normalizeId_(row["billing_group_id"]) === billingGroupId &&
      normalizeId_(row["plan_id"]) === planId;
  });
  if (!invoice) {
    return { ok: false, message: "同期対象の請求明細が見つかりません。" };
  }

  const invoiceId = normalizeId_(invoice["invoice_id"]);
  const paidTotal = getPayments(ctx).filter(function(row) {
    return normalizeId_(row["invoice_id"]) === invoiceId;
  }).reduce(function(sum, row) {
    return sum + Number(row["入金額"] || 0);
  }, 0);

  const status = plannedAmount <= 0 ? "免除" : (paidTotal >= plannedAmount ? "支払済" : "未払い");
  billingRecordUpdateUsageInvoice_(invoiceId, {
    数量: quantity,
    単価: unitPrice,
    上限金額: monthlyCap,
    計算額: calculatedAmount,
    請求予定額: plannedAmount,
    金額: plannedAmount,
    支払状態: status
  }, ctx);

  const viewUpdate = paymentStatusView_refresh(memberId, targetMonth, ctx);
  return {
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
    attendance_details: charge.details || [],
    viewUpdate: viewUpdate,
    message: "回数料金の請求予定額を出席実績から同期しました。"
  };
}
