// 請求業務が必要とする照会。物理Sheet名・行番号を外へ返さない。
// 月次受付は従来どおり状態で除外しない。Active照会とは契約が異なる。
function daoBillingFindMonthlyMember_(memberId, ctx) {
  return daoCore_(ctx).read('members', ctx).find(function(row) {
    return String(row['member_id']).trim() === String(memberId).trim();
  });
}

function daoBillingFindMonthlyFee_(planId, ctx) {
  return daoCore_(ctx).read('fees', ctx).find(function(row) {
    return String(row['plan_id']).trim() === String(planId).trim();
  });
}

function daoBillingFindActiveMember_(memberId, ctx) {
  return daoCore_(ctx).read('members', ctx).find(function(row) {
    return normalizeId_(row['member_id']) === memberId && isActiveMasterRow_(row);
  });
}

function daoBillingFindActiveFee_(planId, ctx) {
  return daoCore_(ctx).read('fees', ctx).find(function(row) {
    return normalizeId_(row['plan_id']) === planId && isActiveMasterRow_(row);
  });
}

function daoBillingFindOpenExtraInvoice_(memberId, planId, targetMonth, ctx) {
  return daoCore_(ctx).read('invoices', ctx).find(function(row) {
    return normalizeMonth(row['target_month']) === targetMonth &&
      normalizeId_(row['member_id']) === memberId &&
      normalizeId_(row['plan_id']) === planId &&
      String(row['支払状態'] || '') !== '取消';
  });
}

function daoBillingFindMonthlySelection_(billingGroupId, targetMonth, ctx) {
  const rows = daoCore_(ctx).read('monthlySelections', ctx);
  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedBillingGroupId = String(billingGroupId).trim();
  return rows.find(function(row) {
    return normalizeMonth(row['target_month']) === normalizedTargetMonth &&
      String(row['billing_group_id']).trim() === normalizedBillingGroupId;
  }) || null;
}

function daoBillingFindUsageInvoice_(billingGroupId, planId, targetMonth, ctx) {
  return daoCore_(ctx).read('invoices', ctx).find(function(row) {
    return normalizeMonth(row['target_month']) === targetMonth &&
      normalizeId_(row['billing_group_id']) === billingGroupId &&
      normalizeId_(row['plan_id']) === planId;
  });
}

function daoBillingFindInvoicePayments_(invoiceId, ctx) {
  return daoCore_(ctx).read('payments', ctx).filter(function(row) {
    return normalizeId_(row['invoice_id']) === invoiceId;
  });
}
