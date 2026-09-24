// 会費受付を道場・課金枠・先生・受付セッションへ関連付ける拡張列。
// 既存列の位置や既存データは変更せず、不足列だけを末尾へ追加する。

const PAYMENT_RECEPTION_SCOPE_HEADERS = [
  "reception_date", "location_id", "billing_block_id", "teacher_id", "reception_session_id"
];

function paymentReception_ensureSchema(ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  return daoPaymentEnsureReceptionSchema_(PAYMENT_RECEPTION_SCOPE_HEADERS, ctx);
}

function setupPaymentReceptionSchema() {
  const result = paymentReception_ensureSchema(createSheetContext());
  const added = Object.keys(result.sheets).reduce(function(sum, sheetName) {
    return sum + result.sheets[sheetName].added_headers.length;
  }, 0);
  Browser.msgBox("会費受付の課金枠列を確認しました。追加列数: " + added);
}

function paymentReception_getScopeSummary(data, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  data = data || {};
  const locationId = normalizeId_(data.location_id);
  const billingBlockId = normalizeId_(data.billing_block_id);
  const receptionDate = paymentStatusTeacher_normalizeDate_(data.reception_date || sup_today(ctx));

  if (!locationId || !billingBlockId) {
    return { ok: false, message: "道場と課金枠を指定してください。" };
  }

  const targetMonth = normalizeMonth(String(receptionDate || "").slice(0, 7));

  // 受付Summaryは20_会費状態ViewだけをReadする。
  // 入金・出席の受付明細もViewへ投影済みなので、06/07を表示時に再Readしない。
  const readModel = paymentReception_buildReadModelFromView_(targetMonth, ctx);
  const rows = readModel.receptionPayments.filter(function(payment) {
    return paymentStatusTeacher_normalizeDate_(payment.reception_date) === receptionDate &&
      normalizeId_(payment.location_id) === locationId &&
      normalizeId_(payment.billing_block_id) === billingBlockId;
  });

  const cashTotal = paymentReception_sumViewMethod_(rows, "CASH");
  const paypayTotal = paymentReception_sumViewMethod_(rows, "PAYPAY");
  const total = rows.reduce(function(sum, row) {
    return sum + Number(row.amount || 0);
  }, 0);

  const payments = rows.map(function(row) {
    const memberId = normalizeId_(row.member_id);
    const method = paymentEvidence_normalizePaymentMethod_(row.payment_method);
    return {
      payment_id: normalizeId_(row.payment_id),
      member_id: memberId,
      member_name: readModel.memberNames[memberId] || "",
      billing_group_id: normalizeId_(row.billing_group_id) || readModel.memberToGroup[memberId] || "",
      invoice_id: normalizeId_(row.invoice_id),
      target_month: normalizeMonth(row.target_month),
      amount: Number(row.amount || 0),
      payment_method: method,
      payment_method_label: method === "CASH" ? "現金" : (method === "PAYPAY" ? "PayPay" : String(row.payment_method || "その他")),
      paid_at: String(row.paid_at || "")
    };
  });

  const reconciliation = paymentReception_makeAttendanceReconciliation_(
    receptionDate, locationId, billingBlockId, rows, readModel
  );

  return {
    ok: true,
    reception_date: receptionDate,
    location_id: locationId,
    billing_block_id: billingBlockId,
    cash_total: cashTotal,
    paypay_total: paypayTotal,
    other_total: total - cashTotal - paypayTotal,
    total_amount: total,
    payment_count: rows.length,
    payments: payments,
    expected_total: reconciliation.expected_total,
    outstanding_total: reconciliation.outstanding_total,
    attendance_member_count: reconciliation.attendance_member_count,
    reconciliation_items: reconciliation.items
  };
}

// 20_会費状態Viewだけから受付Summary用Read Modelを構築する。
// Viewのgrain(member × month)は維持し、明細JSONをメモリ上で展開する。
function paymentReception_buildReadModelFromView_(targetMonth, ctx) {
  const memberNames = {};
  const memberToGroup = {};
  const groupMembers = {};
  const invoiceMemberIds = {};
  // group未払いは member行の代表値ではなく、View内の請求・入金明細から算出する。
  // member × month Viewでは同一invoice/paymentが複数行に現れる可能性があるため、
  // IDで重複排除してから billing_group_id 単位へ集計する。
  const invoiceById = {};
  const paymentById = {};
  const unpaidByGroup = {};
  const receptionPayments = [];
  const attendanceItems = [];

  getSheetRows(ctx, "20_会費状態View").forEach(function(viewRow) {
    if (normalizeMonth(viewRow["target_month"]) !== normalizeMonth(targetMonth)) return;

    const memberId = normalizeId_(viewRow["member_id"]);
    const groupId = normalizeId_(viewRow["billing_group_id"]);
    if (memberId) {
      memberNames[memberId] = String(viewRow["会員名"] || "");
      if (groupId) {
        memberToGroup[memberId] = groupId;
        if (!groupMembers[groupId]) groupMembers[groupId] = [];
        if (groupMembers[groupId].indexOf(memberId) < 0) groupMembers[groupId].push(memberId);
      }
    }

    paymentStatusView_parseInvoiceItems_(viewRow["invoice_items_json"]).forEach(function(item) {
      const invoiceId = normalizeId_(item.invoice_id);
      const invoiceMemberId = normalizeId_(item.member_id);
      if (invoiceId && invoiceMemberId) invoiceMemberIds[invoiceId] = invoiceMemberId;
      if (invoiceId && !invoiceById[invoiceId]) invoiceById[invoiceId] = item;
    });

    paymentReception_parseViewItems_(viewRow["reception_payments_json"]).forEach(function(item) {
      const paymentId = normalizeId_(item.payment_id);
      if (paymentId) {
        if (!paymentById[paymentId]) paymentById[paymentId] = item;
      } else {
        // 旧View等でpayment_idが無い明細は表示互換のため保持する。
        receptionPayments.push(item);
      }
    });
    paymentReception_parseViewItems_(viewRow["attendance_items_json"]).forEach(function(item) {
      attendanceItems.push(item);
    });
  });

  // 受付一覧にも重複排除済みの入金明細を合流する。
  Object.keys(paymentById).forEach(function(paymentId) {
    receptionPayments.push(paymentById[paymentId]);
  });

  const billedByGroup = {};
  Object.keys(invoiceById).forEach(function(invoiceId) {
    const invoice = invoiceById[invoiceId] || {};
    // 免除は回収対象に含めない。支払済も入金明細との差引で0になるため請求額には含める。
    if (String(invoice.status || "") === "免除") return;
    const invoiceMemberId = normalizeId_(invoice.member_id) || invoiceMemberIds[invoiceId] || "";
    const invoiceGroupId = normalizeId_(invoice.billing_group_id) || memberToGroup[invoiceMemberId] || "";
    if (!invoiceGroupId) return;
    billedByGroup[invoiceGroupId] = Number(billedByGroup[invoiceGroupId] || 0) + Number(invoice.amount || 0);
  });

  const paidByGroup = {};
  Object.keys(paymentById).forEach(function(paymentId) {
    const payment = paymentById[paymentId] || {};
    const invoiceId = normalizeId_(payment.invoice_id);
    const paymentMemberId = normalizeId_(payment.member_id) || invoiceMemberIds[invoiceId] || "";
    const paymentGroupId = normalizeId_(payment.billing_group_id) || memberToGroup[paymentMemberId] || "";
    if (!paymentGroupId) return;
    paidByGroup[paymentGroupId] = Number(paidByGroup[paymentGroupId] || 0) + Number(payment.amount || 0);
  });

  Object.keys(billedByGroup).forEach(function(groupId) {
    unpaidByGroup[groupId] = Math.max(
      Number(billedByGroup[groupId] || 0) - Number(paidByGroup[groupId] || 0),
      0
    );
  });

  return {
    memberNames: memberNames,
    memberToGroup: memberToGroup,
    groupMembers: groupMembers,
    invoiceMemberIds: invoiceMemberIds,
    unpaidByGroup: unpaidByGroup,
    receptionPayments: receptionPayments,
    attendanceItems: attendanceItems
  };
}

function paymentReception_parseViewItems_(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// 出席と入金は独立した事実として扱い、先生が例外だけ確認できる形へ整形する。
function paymentReception_makeAttendanceReconciliation_(receptionDate, locationId, billingBlockId, scopePayments, readModel) {
  const memberNames = readModel.memberNames;
  const memberToGroup = readModel.memberToGroup;
  const groupMembers = readModel.groupMembers;
  const unpaidByGroup = readModel.unpaidByGroup;

  const attendedMembers = {};
  (readModel.attendanceItems || []).forEach(function(row) {
    if (paymentStatusTeacher_normalizeDate_(row.attendance_date) !== receptionDate) return;
    if (normalizeId_(row.location_id) !== locationId) return;
    if (normalizeId_(row.billing_block_id) !== billingBlockId) return;
    if (normalizeId_(row.status) === "取消") return;
    const memberId = normalizeId_(row.member_id);
    if (memberId) attendedMembers[memberId] = true;
  });

  const attendedGroups = {};
  Object.keys(attendedMembers).forEach(function(memberId) {
    const groupId = memberToGroup[memberId];
    if (groupId) attendedGroups[groupId] = true;
  });

  const scopePaidGroups = {};
  (scopePayments || []).forEach(function(payment) {
    const memberId = normalizeId_(payment.member_id) || readModel.invoiceMemberIds[normalizeId_(payment.invoice_id)] || "";
    const groupId = normalizeId_(payment.billing_group_id) || memberToGroup[memberId];
    if (groupId) scopePaidGroups[groupId] = true;
  });

  const items = [];
  let expectedTotal = 0;
  Object.keys(attendedGroups).forEach(function(groupId) {
    const unpaid = Math.max(Number(unpaidByGroup[groupId] || 0), 0);
    expectedTotal += unpaid;
    if (unpaid <= 0) return;
    const attended = (groupMembers[groupId] || []).filter(function(memberId) { return attendedMembers[memberId]; });
    items.push({
      status: "ATTENDED_UNPAID",
      label: "出席あり・未回収",
      billing_group_id: groupId,
      member_ids: attended,
      member_names: attended.map(function(memberId) { return memberNames[memberId] || memberId; }),
      amount: unpaid
    });
  });

  Object.keys(scopePaidGroups).forEach(function(groupId) {
    if (attendedGroups[groupId]) return;
    const groupScopePayments = (scopePayments || []).filter(function(payment) {
      const memberId = normalizeId_(payment.member_id) || readModel.invoiceMemberIds[normalizeId_(payment.invoice_id)] || "";
      return (normalizeId_(payment.billing_group_id) || memberToGroup[memberId]) === groupId;
    });
    const amount = groupScopePayments.reduce(function(sum, payment) {
      return sum + Number(payment.amount || 0);
    }, 0);
    const payerIds = Array.from(new Set(groupScopePayments.map(function(payment) {
      return normalizeId_(payment.member_id) || readModel.invoiceMemberIds[normalizeId_(payment.invoice_id)] || "";
    }).filter(Boolean)));
    items.push({
      status: "PAID_WITHOUT_ATTENDANCE",
      label: "支払いあり・出席なし",
      billing_group_id: groupId,
      member_ids: payerIds,
      member_names: payerIds.map(function(memberId) { return memberNames[memberId] || memberId; }),
      amount: amount
    });
  });

  return {
    expected_total: expectedTotal,
    outstanding_total: expectedTotal,
    attendance_member_count: Object.keys(attendedMembers).length,
    items: items
  };
}

function paymentReception_sumViewMethod_(rows, method) {
  return (rows || []).reduce(function(sum, row) {
    const normalized = paymentEvidence_normalizePaymentMethod_(row.payment_method);
    return sum + (normalized === method ? Number(row.amount || 0) : 0);
  }, 0);
}


function paymentReception_sumMethod_(rows, method) {
  return rows.reduce(function(sum, row) {
    const normalized = paymentEvidence_normalizePaymentMethod_(row["支払方法"]);
    return sum + (normalized === method ? Number(row["入金額"] || row["金額"] || 0) : 0);
  }, 0);
}
