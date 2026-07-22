// 先生用「会費状況」Query。
// 06_入金ログの期間集計と、05_請求明細を基準にした会員別月次状況を返す。

function paymentStatusTeacher_get(data, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  data = data || {};

  const targetMonth = normalizeMonth(data.target_month || data.targetMonth || sup_targetMonth(ctx));
  const defaultRange = paymentStatusTeacher_monthRange_(targetMonth);
  const dateFrom = paymentStatusTeacher_normalizeDate_(data.date_from || data.dateFrom) || defaultRange.date_from;
  const dateTo = paymentStatusTeacher_normalizeDate_(data.date_to || data.dateTo) || defaultRange.date_to;

  if (dateFrom > dateTo) {
    return { ok: false, message: "開始日は終了日以前を指定してください。" };
  }

  const payments = getPayments(ctx);
  const periodPayments = payments.filter(function(payment) {
    const paymentDate = paymentStatusTeacher_normalizeDate_(payment["日時"]);
    return paymentDate && paymentDate >= dateFrom && paymentDate <= dateTo;
  });

  const periodRows = periodPayments.map(function(payment) {
    const method = paymentEvidence_normalizePaymentMethod_(payment["支払方法"]);
    return {
      payment_id: normalizeId_(payment["payment_id"]),
      paid_at: paymentStatusTeacher_formatDateTime_(payment["日時"]),
      target_month: normalizeMonth(payment["target_month"]),
      member_id: normalizeId_(payment["member_id"]),
      billing_group_id: normalizeId_(payment["billing_group_id"]),
      invoice_id: normalizeId_(payment["invoice_id"]),
      payment_method: method,
      payment_method_label: paymentEvidence_toDisplayPaymentMethod_(method),
      amount: Number(payment["入金額"] || payment["金額"] || 0)
    };
  }).sort(function(a, b) {
    return String(b.paid_at).localeCompare(String(a.paid_at));
  });

  const cashTotal = paymentStatusTeacher_sumMethod_(periodRows, "CASH");
  const paypayTotal = paymentStatusTeacher_sumMethod_(periodRows, "PAYPAY");
  const total = periodRows.reduce(function(sum, row) { return sum + row.amount; }, 0);

  return {
    ok: true,
    date_from: dateFrom,
    date_to: dateTo,
    target_month: targetMonth,
    summary: {
      cash_total: cashTotal,
      paypay_total: paypayTotal,
      other_total: total - cashTotal - paypayTotal,
      total_amount: total,
      payment_count: periodRows.length
    },
    payments: periodRows,
    members: paymentStatusTeacher_makeMonthlyRows_(targetMonth, payments, ctx)
  };
}

function paymentStatusTeacher_makeMonthlyRows_(targetMonth, payments, ctx) {
  const membersByGroup = {};
  getMembers(ctx).forEach(function(member) {
    if (!isActiveMasterRow_(member)) return;
    const groupId = normalizeId_(member["請求グループID"]);
    if (!groupId) return;
    if (!membersByGroup[groupId]) membersByGroup[groupId] = [];
    membersByGroup[groupId].push({
      member_id: normalizeId_(member["member_id"]),
      member_name: String(member["氏名"] || "")
    });
  });

  const groups = {};
  getInvoices(ctx).forEach(function(invoice) {
    if (normalizeMonth(invoice["target_month"]) !== targetMonth) return;
    const groupId = normalizeId_(invoice["billing_group_id"]);
    if (!groupId) return;
    if (!groups[groupId]) {
      groups[groupId] = {
        billing_group_id: groupId,
        invoice_count: 0,
        billed_total: 0,
        labels: []
      };
    }
    const group = groups[groupId];
    group.invoice_count++;
    group.billed_total += Number(invoice["請求予定額"] || invoice["金額"] || 0);
    const label = String(invoice["表示名"] || invoice["請求種別"] || invoice["plan_id"] || "");
    if (label && group.labels.indexOf(label) < 0) group.labels.push(label);
  });

  return Object.keys(groups).map(function(groupId) {
    const group = groups[groupId];
    const groupMembers = membersByGroup[groupId] || [];
    const paidTotal = payment_getPaidTotal(payments, targetMonth, groupId);
    const unpaidAmount = Math.max(group.billed_total - paidTotal, 0);
    const lessonCount = groupMembers.reduce(function(sum, member) {
      return sum + Number(calculateAttendanceChargeCount(member.member_id, targetMonth, ctx).charge_count || 0);
    }, 0);

    return {
      billing_group_id: groupId,
      member_ids: groupMembers.map(function(member) { return member.member_id; }),
      member_names: groupMembers.map(function(member) { return member.member_name; }).filter(Boolean),
      invoice_count: group.invoice_count,
      invoice_summary: group.labels.join(" / "),
      billed_total: group.billed_total,
      paid_total: paidTotal,
      unpaid_amount: unpaidAmount,
      lesson_count: lessonCount,
      status: group.billed_total === 0 ? "免除" : (unpaidAmount === 0 ? "支払済" : "未払い")
    };
  }).sort(function(a, b) {
    if (a.unpaid_amount !== b.unpaid_amount) return b.unpaid_amount - a.unpaid_amount;
    return (a.member_names.join(" ") || a.billing_group_id)
      .localeCompare(b.member_names.join(" ") || b.billing_group_id, "ja");
  });
}

function paymentStatusTeacher_sumMethod_(rows, method) {
  return rows.reduce(function(sum, row) {
    return sum + (row.payment_method === method ? Number(row.amount || 0) : 0);
  }, 0);
}

function paymentStatusTeacher_monthRange_(targetMonth) {
  const parts = String(targetMonth || "").split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!year || !month) return { date_from: "", date_to: "" };
  const lastDay = new Date(year, month, 0).getDate();
  return {
    date_from: targetMonth + "-01",
    date_to: targetMonth + "-" + String(lastDay).padStart(2, "0")
  };
}

function paymentStatusTeacher_normalizeDate_(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})/);
  if (!match) return "";
  return match[1] + "-" + String(Number(match[2])).padStart(2, "0") + "-" + String(Number(match[3])).padStart(2, "0");
}

function paymentStatusTeacher_formatDateTime_(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm");
  }
  return String(value);
}
