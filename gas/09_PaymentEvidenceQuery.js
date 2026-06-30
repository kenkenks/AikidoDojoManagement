// 09_PaymentEvidenceQuery.gs
//   先生会費画面で使う決済エビデンス一覧取得・選択POST用の補助API
//
// 方針:
// ・会員画面の PayPay 決済コード登録は 09 CONFIRMED まで。
// ・先生会費画面の [決済更新] で 09 CONFIRMED を 06/05/20 へ反映し、09 POSTED にする。

function paymentEvidenceQuery_list(data, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  data = data || {};

  const targetMonth = normalizeMonth(data.target_month || data.targetMonth || paymentEvidenceQuery_currentMonth_());
  const methodFilter = normalizeId_(data.payment_method || data.paymentMethod || "");
  const statuses = paymentEvidenceQuery_parseStatuses_(data.statuses || data.status || "CONFIRMED");

  const invoicesById = {};
  getInvoices(ctx).forEach(function(invoice) {
    invoicesById[normalizeId_(invoice["invoice_id"])] = invoice;
  });

  const memberNames = {};
  getMembers(ctx).forEach(function(member) {
    memberNames[normalizeId_(member["member_id"])] = String(member["氏名"] || "");
  });

  const rows = getPaymentEvidences(ctx)
    .filter(function(evidence) {
      const status = normalizeId_(evidence["status"]);
      if (statuses.length > 0 && statuses.indexOf(status) < 0) return false;

      const method = paymentEvidence_normalizePaymentMethod_(evidence["payment_method"]);
      if (methodFilter && method !== paymentEvidence_normalizePaymentMethod_(methodFilter)) return false;

      const invoice = invoicesById[normalizeId_(evidence["invoice_id"])] || null;
      const month = invoice
        ? normalizeMonth(invoice["target_month"])
        : normalizeMonth(evidence["target_month"] || "");

      if (targetMonth && month !== targetMonth) return false;

      return true;
    })
    .map(function(evidence) {
      const invoice = invoicesById[normalizeId_(evidence["invoice_id"])] || {};
      const memberId = normalizeId_(evidence["member_id"] || invoice["member_id"]);
      const method = paymentEvidence_normalizePaymentMethod_(evidence["payment_method"]);
      const status = normalizeId_(evidence["status"]);

      return {
        evidence_id: normalizeId_(evidence["evidence_id"]),
        invoice_id: normalizeId_(evidence["invoice_id"]),
        member_id: memberId,
        member_name: memberNames[memberId] || "",
        billing_group_id: normalizeId_(evidence["billing_group_id"] || invoice["billing_group_id"]),
        target_month: normalizeMonth(invoice["target_month"] || evidence["target_month"] || targetMonth),
        plan_id: normalizeId_(invoice["plan_id"]),
        label: String(invoice["表示名"] || invoice["請求種別"] || invoice["plan_id"] || ""),
        payment_method: method,
        payment_method_label: paymentEvidence_toDisplayPaymentMethod_(method),
        amount: Number(evidence["amount"] || invoice["請求予定額"] || invoice["金額"] || 0),
        status: status,
        evidence_code: normalizeId_(evidence["evidence_code"]),
        requested_at: paymentEvidenceQuery_formatDateTime_(evidence["requested_at"]),
        confirmed_at: paymentEvidenceQuery_formatDateTime_(evidence["confirmed_at"]),
        posted_at: paymentEvidenceQuery_formatDateTime_(evidence["posted_at"]),
        payment_log_id: normalizeId_(evidence["payment_log_id"]),
        remarks: String(evidence["remarks"] || "")
      };
    });

  return {
    ok: true,
    success: true,
    target_month: targetMonth,
    statuses: statuses,
    payment_method: methodFilter,
    count: rows.length,
    total_amount: rows.reduce(function(sum, row) { return sum + Number(row.amount || 0); }, 0),
    evidences: rows
  };
}

function paymentEvidence_postSelectedBatch(data, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ctx = ensureSheetContext(ctx || createSheetContext());
    data = data || {};

    const teacherId = normalizeId_(data.teacher_id || data.teacherId);
    const items = Array.isArray(data.evidence_items)
      ? data.evidence_items
      : (Array.isArray(data.evidences) ? data.evidences : []);

    if (!teacherId) {
      return { ok: false, success: false, message: "teacher_id がありません。" };
    }

    if (items.length === 0) {
      return { ok: false, success: false, message: "POST対象の決済エビデンスがありません。" };
    }

    const results = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const evidenceId = normalizeId_(item.evidence_id || item.evidenceId);

      if (!evidenceId) {
        results.push({ ok: false, index: i, evidence_id: "", message: "evidence_id がありません。" });
        continue;
      }

      try {
        const result = paymentEvidence_post({ evidence_id: evidenceId }, ctx);
        results.push({
          ok: true,
          index: i,
          evidence_id: evidenceId,
          payment_id: result.payment && result.payment.payment_id ? result.payment.payment_id : "",
          message: "POST完了"
        });
      } catch (e) {
        results.push({
          ok: false,
          index: i,
          evidence_id: evidenceId,
          message: e.message
        });
      }
    }

    return {
      ok: results.every(function(result) { return result.ok; }),
      success: results.every(function(result) { return result.ok; }),
      results: results,
      posted: results.filter(function(result) { return result.ok; }),
      skipped: results.filter(function(result) { return !result.ok; }),
      message: "選択した決済エビデンスをPOSTしました。"
    };

  } finally {
    lock.releaseLock();
  }
}

function paymentEvidenceQuery_parseStatuses_(value) {
  if (Array.isArray(value)) {
    return value.map(function(status) { return normalizeId_(status); }).filter(function(status) { return !!status; });
  }

  const text = String(value || "").trim();
  if (!text) return [];

  return text.split(",").map(function(status) {
    return normalizeId_(status);
  }).filter(function(status) {
    return !!status;
  });
}

function paymentEvidenceQuery_currentMonth_() {
  return sup_targetMonth(ctx);
}

function paymentEvidenceQuery_formatDateTime_(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");
  }

  return String(value || "");
}
