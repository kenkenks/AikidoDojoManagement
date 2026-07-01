// 09_PaymentEvidenceRequest.gs
//   決済エビデンス要求を作成する
//   09_決済エビデンス に REQUESTED 行を新規登録する

// ==============================
// 決済エビデンス要求（メイン）
// ==============================
function paymentEvidence_request(input, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());

  try {
    const requestContext = paymentEvidenceRequest_collect(input, ctx);
    const request = paymentEvidenceRequest_make(requestContext, ctx);
  
    return paymentEvidenceRequest_register(request, ctx);
  } catch (e) {
    throw new Error("request: 決済エビデンス要求の収集に失敗しました: " + e.message);
  }
}

// payment.html の payment_batch から09要求を一括作成する。
function paymentEvidence_requestBatch(data, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ctx = ensureSheetContext(ctx || createSheetContext());
    const teacherId = normalizeId_(data.teacher_id);
    const payments = Array.isArray(data.payments)
      ? data.payments
      : (Array.isArray(data.payment_items) ? data.payment_items : []);

    if (!teacherId) {
      return { ok: false, message: "request: teacher_id がありません。" };
    }

    if (payments.length === 0) {
      return { ok: false, message: "request: 決済エビデンス要求の対象がありません。" };
    }
    const results = [];

    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];

      try {
        const result = paymentEvidence_request({
          invoice_id: payment.invoice_id || "",
          member_id: payment.member_id || "",
          payment_method: payment.payment_method || "",
          amount: payment.amount,
          remarks: payment.remarks || "会費受付画面から要求作成"
        }, ctx);

        results.push({
          ok: true,
          index: i,
          invoice_id: result.request.invoice_id,
          member_id: result.request.member_id,
          payment_method: result.request.payment_method,
          evidence_id: result.evidence_id,
          status: result.request.status,
          message: result.message || ""
        });

      } catch (e) {
        results.push({
          ok: false,
          index: i,
          invoice_id: payment.invoice_id || "",
          member_id: payment.member_id || "",
          payment_method: payment.payment_method || "",
          evidence_id: payment.evidence_id || "",
          status: "ERROR",
          message: e.message
        });

        continue;
      }
    }
    
    return {
      ok: results.every(r => r.ok),
      records: results,
      message: "request: 決済エビデンス要求を作成しました。"
    };

  } finally {
    lock.releaseLock();
  }
}

// ==============================
// 情報収集
// ==============================
function paymentEvidenceRequest_collect(input, ctx) {
  ctx = ensureSheetContext(ctx);

  // input
  // 

  if (!input.invoice_id) {
    throw new Error("request: 対象の invoice_id が見つかりません。");
  }

  const invoice_id = input.invoice_id;
  const payment_method = input.payment_method;

  const invoice = getInvoice(invoice_id, ctx);
  if (existsActivePaymentEvidence(invoice_id, ctx)) {
    throw new Error("request: この請求の決済エビデンスは既にあります: " + invoice_id);
  }
  if (!invoice) {
    throw new Error("request: 請求明細が見つかりません: " + invoice_id);
  }

  const billing_group_id = invoice.billing_group_id;
  const member_id = invoice.member_id;
  const amount = Number(invoice.請求予定額 || 0);

  if (!member_id) {
    throw new Error("request: member_id がありません。");
  }

  if (!payment_method) {
    throw new Error("request: payment_method がありません。");
  }

  if (amount <= 0) {
    throw new Error("request: amount は1円以上で指定してください。");
  }

  const inputMemberId = input.member_id || input.memberId || "";

  if (inputMemberId && member_id !== inputMemberId) {
    throw new Error(
      "request: invoice_id と member_id が一致しません: " + invoice_id + " / " + inputMemberId
    );
  }

  return {
    invoice_id: invoice_id,
    billing_group_id: billing_group_id,
    member_id: member_id,
    payment_method: payment_method,
    amount: amount,
    remarks: input.remarks || ""
  };
}

// ==============================
// Request生成
// ==============================
function paymentEvidenceRequest_make(context, ctx) {
  return {
    evidence_id: paymentEvidence_createEvidenceId_(context.payment_method),
    invoice_id: context.invoice_id,
    billing_group_id: context.billing_group_id,
    member_id: context.member_id,
    payment_method: context.payment_method,
    amount: Number(context.amount || 0),
    status: "REQUESTED",
    evidence_code: "",
    requested_at: sup_now(ctx),
    confirmed_at: "",
    confirmed_by: "",
    posted_at: "",
    payment_log_id: "",
    remarks: context.remarks || ""
  };
}

// ==============================
// Request登録
// ==============================
function paymentEvidenceRequest_register(request, ctx) {
  ctx = ensureSheetContext(ctx);

  const existing = paymentEvidence_getRows(ctx);
  const duplicated = existing.some(row =>
    normalizeId_(row["evidence_id"]) === normalizeId_(request.evidence_id)
  );

  if (duplicated) {
    return {
      ok: true,
      evidence_id: request.evidence_id,
      //evidence_code: request.evidence_code || "",
      //confirmed_by: request.confirmed_by || "",
      remarks: request.remarks || "",
      skipped: true,
      message: "request: 既に登録済みの evidence_id です。",
      request
    };
  }

  paymentEvidence_append(ctx, request);

  return {
    ok: true,
    evidence_id: request.evidence_id,
    //evidence_code: request.evidence_code || "",
    //confirmed_by: request.confirmed_by || "",
    remarks: request.remarks || "",
    skipped: false,
    message: "request: 決済エビデンス要求を作成しました。",
    request
  };
}

// ==============================
// DAO / 共通
// ==============================
function paymentEvidence_append(ctx, evidence) {
  ctx = ensureSheetContext(ctx);

  const sheet = getRequiredSheet_(ctx, "09_決済エビデンス");
  assertHeaders_(sheet, paymentEvidence_requiredHeaders_());

  appendObjectsByHeader_(sheet, [evidence]);
  paymentEvidence_invalidate(ctx);
}

function paymentEvidence_getRows(ctx) {
  ctx = ensureSheetContext(ctx);
  return getSheetRows(ctx, "09_決済エビデンス");
}

function existsActivePaymentEvidence(invoice_id, ctx) {
  const existing = paymentEvidence_getRows(ctx);
  return existing.some(row =>
    normalizeId_(row["invoice_id"]) === normalizeId_(invoice_id) 
    && ["REQUESTED", "CONFIRMED", "POSTED"].includes(row["status"])
  );
}

function paymentEvidence_invalidate(ctx) {
  invalidateSheetRows(ctx, "09_決済エビデンス");
}



function paymentEvidence_requiredHeaders_() {
  return [
    "evidence_id",
    "invoice_id",
    "member_id",
    "payment_method",
    "amount",
    "status",
    "evidence_code",
    "requested_at",
    "confirmed_at",
    "confirmed_by",
    "posted_at",
    "payment_log_id",
    "remarks"
  ];
}

function paymentEvidence_createEvidenceId_(paymentMethod) {
  return paymentEvidence_normalizePaymentMethod_(paymentMethod) + "-" + Utilities.getUuid().slice(0, 8);
}

function paymentEvidence_normalizePaymentMethod_(value) {
  const text = normalizeId_(value);
  if (!text) return "";

  const upper = text.toUpperCase();
  if (upper === "CASH" || text === "現金") return "CASH";
  if (upper === "PAYPAY" || text === "PayPay" || text === "ペイペイ") return "PAYPAY";

  return upper;
}

function paymentEvidence_findInvoiceById_(invoiceId, ctx) {
  const id = normalizeId_(invoiceId);
  if (!id) return null;

  return getInvoices(ctx).find(invoice =>
    normalizeId_(invoice["invoice_id"]) === id
  ) || null;
}

function paymentEvidence_findUnpaidInvoiceIdByMember_(memberId, ctx) {
  const targetMonth = sup_targetMonth(ctx);

  const members = getMembers(ctx);
  const member = members.find(row =>
    normalizeId_(row["member_id"]) === normalizeId_(memberId)
  );

  if (!member) {
    throw new Error("会員が見つかりません: " + memberId);
  }

  const billingGroupId = normalizeId_(member["請求グループID"]);
  if (!billingGroupId) {
    throw new Error("請求グループIDがありません: " + memberId);
  }

  const invoice = getInvoices(ctx).find(row =>
    normalizeMonth(row["target_month"]) === normalizeMonth(targetMonth) &&
    normalizeId_(row["billing_group_id"]) === billingGroupId &&
    normalizeId_(row["支払状態"]) !== "支払済"
  );

  return invoice ? normalizeId_(invoice["invoice_id"]) : "";
}