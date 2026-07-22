// 会費受付を道場・課金枠・先生・受付セッションへ関連付ける拡張列。
// 既存列の位置や既存データは変更せず、不足列だけを末尾へ追加する。

const PAYMENT_RECEPTION_SCOPE_HEADERS = [
  "location_id", "billing_block_id", "teacher_id", "reception_session_id"
];

function paymentReception_ensureSchema(ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  const results = {};
  ["09_決済エビデンス", "06_入金ログ"].forEach(function(sheetName) {
    const sheet = getRequiredSheet_(sheetName, ctx);
    const before = getHeaderMap_(sheet).headers.length;
    const missing = PAYMENT_RECEPTION_SCOPE_HEADERS.filter(function(header) {
      return getHeaderMap_(sheet).map[header] === undefined;
    });
    if (missing.length > 0) {
      sheet.getRange(1, before + 1, 1, missing.length).setValues([missing]);
      invalidateSheetRows(ctx, sheetName);
    }
    results[sheetName] = { added_headers: missing };
  });
  return { ok: true, sheets: results };
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

  const rows = getPayments(ctx).filter(function(payment) {
    return paymentStatusTeacher_normalizeDate_(payment["日時"]) === receptionDate &&
      normalizeId_(payment["location_id"]) === locationId &&
      normalizeId_(payment["billing_block_id"]) === billingBlockId;
  });
  const cashTotal = paymentReception_sumMethod_(rows, "CASH");
  const paypayTotal = paymentReception_sumMethod_(rows, "PAYPAY");
  const total = rows.reduce(function(sum, row) {
    return sum + Number(row["入金額"] || row["金額"] || 0);
  }, 0);
  const memberNames = {};
  getMembers(ctx).forEach(function(member) {
    memberNames[normalizeId_(member["member_id"])] = String(member["氏名"] || "");
  });
  const payments = rows.map(function(row) {
    const memberId = normalizeId_(row["member_id"]);
    const method = paymentEvidence_normalizePaymentMethod_(row["支払方法"]);
    return {
      payment_id: normalizeId_(row["payment_id"]),
      member_id: memberId,
      member_name: memberNames[memberId] || "",
      billing_group_id: normalizeId_(row["billing_group_id"]),
      invoice_id: normalizeId_(row["invoice_id"]),
      target_month: normalizeMonth(row["target_month"]),
      amount: Number(row["入金額"] || row["金額"] || 0),
      payment_method: method,
      payment_method_label: method === "CASH" ? "現金" : (method === "PAYPAY" ? "PayPay" : String(row["支払方法"] || "その他")),
      paid_at: paymentStatusTeacher_formatDateTime_(row["日時"])
    };
  });

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
    payments: payments
  };
}

function paymentReception_sumMethod_(rows, method) {
  return rows.reduce(function(sum, row) {
    const normalized = paymentEvidence_normalizePaymentMethod_(row["支払方法"]);
    return sum + (normalized === method ? Number(row["入金額"] || row["金額"] || 0) : 0);
  }, 0);
}
