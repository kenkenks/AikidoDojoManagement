/**
 * ROLE
 * PaymentEvidenceRequestService
 *
 * RESPONSIBILITY
 * 決済エビデンス要求受付の入口。
 *
 * FLOW
 * Collect
 *   ↓
 * Make
 *   ↓
 * Register
 *
 * NOTE
 * PaymentEvidence Request のオーケストレーター。
 */

// 09_PaymentEvidencePost.gs
//   CONFIRMED の決済エビデンスを 06_入金ログ に反映する
//   反映後、09_決済エビデンス を POSTED に更新する

// ==============================
// 決済エビデンス反映（単体メイン）
// ==============================
function paymentEvidence_post(input, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ctx = ensureSheetContext(ctx || createSheetContext());

    const postContext = paymentEvidencePost_collect(input, ctx);
    const payment = paymentEvidencePost_make(postContext, ctx);
    const registerResult = paymentEvidencePost_register(payment, ctx);

    if (registerResult.ok && !registerResult.skipped) {
      paymentEvidencePost_updatePosted({
        evidence_id: postContext.evidence.evidence_id,
        payment_log_id: payment.payment_id
      }, ctx);
    }

    const invoice = postContext.invoice;
    const statusUpdate = payment_updateInvoiceStatus(
      invoice["target_month"],
      invoice["billing_group_id"],
      ctx
    );

    const viewUpdate = paymentStatusView_refresh(
      postContext.evidence.member_id,
      normalizeMonth(invoice["target_month"]),
      ctx
    );

    return {
      ok: true,
      payment,
      registerResult,
      statusUpdate,
      viewUpdate
    };

  } finally {
    lock.releaseLock();
  }
}

// CONFIRMED をまとめて06へ反映する。
function paymentEvidence_postBatch(ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ctx = ensureSheetContext(ctx || createSheetContext());

    const evidences = getPaymentEvidences(ctx);

    const confirmed = evidences.filter(function(evidence) {
      return evidence.status === "CONFIRMED";
    });

    if (confirmed.length === 0) {
      return {
        ok: true,
        results: [],
        posted: [],
        skipped: [],
        message: "post: POST対象の決済エビデンスはありません。"
      };
    }

    const results = [];

    for (let i = 0; i < confirmed.length; i++) {
      const evidence = confirmed[i];

      try {
        const result = paymentEvidence_post({
          evidence_id: evidence.evidence_id
        }, ctx);

        results.push({
          ok: true,
          index: i,
          evidence_id: evidence.evidence_id,
          invoice_id: evidence.invoice_id,
          member_id: evidence.member_id,
          payment_log_id: result.payment_log_id || result.payment_id || "",
          status: "POSTED"
        });

      } catch (e) {
        results.push({
          ok: false,
          index: i,
          evidence_id: evidence.evidence_id || "",
          invoice_id: evidence.invoice_id || "",
          member_id: evidence.member_id || "",
          message: e.message
        });

        continue;
      }
    }

    return {
      ok: results.every(function(r) { return r.ok; }),
      results: results,
      posted: results.filter(function(r) { return r.ok; }),
      skipped: results.filter(function(r) { return !r.ok; }),
      message: "post: CONFIRMEDの決済エビデンスを06へ反映しました。"
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * ROLE
 * PaymentEvidenceRequest / Collect
 *
 * RESPONSIBILITY
 * REQUESTED作成に必要な情報を収集する。
 */
function paymentEvidencePost_collect(input, ctx) {
  ctx = ensureSheetContext(ctx);

  const evidenceId = normalizeId_(input.evidence_id || input.evidenceId);
  if (!evidenceId) {
    throw new Error("post: evidence_id がありません。");
  }

  const target = paymentEvidence_findRowById_(evidenceId, ctx);
  if (!target) {
    throw new Error("post: 決済エビデンスが見つかりません: " + evidenceId);
  }

  const evidence = target.row;
  const status = normalizeId_(evidence["status"]);

  if (status === "POSTED") {
    throw new Error("post: 既に06へ反映済みです: " + evidenceId);
  }

  if (status !== "CONFIRMED") {
    throw new Error("post: CONFIRMEDではないため06へ反映できません: " + status);
  }

  if (!normalizeId_(evidence["evidence_code"])) {
    throw new Error("post: evidence_code がありません: " + evidenceId);
  }

  if (normalizeId_(evidence["payment_log_id"])) {
    throw new Error("post: payment_log_id が設定済みです: " + evidence["payment_log_id"]);
  }

  const invoice = paymentEvidence_findInvoiceById_(evidence["invoice_id"], ctx);
  if (!invoice) {
    throw new Error("post: 請求明細が見つかりません: " + evidence["invoice_id"]);
  }

  return {
    evidence,
    invoice
  };
}

/**
 * ROLE
 * PaymentEvidenceRequest / Make
 *
 * RESPONSIBILITY
 * REQUESTEDレコードを生成する。
 */
function paymentEvidencePost_make(context, ctx) {
  const evidence = context.evidence;
  const invoice = context.invoice;

  return {
    payment_id: "PAY-" + Utilities.getUuid().slice(0, 8),
    日時: evidence["confirmed_at"] || sup_now(ctx),
    target_month: normalizeMonth(invoice["target_month"]),
    billing_group_id: normalizeId_(invoice["billing_group_id"]),
    invoice_id: normalizeId_(invoice["invoice_id"]),
    member_id: normalizeId_(evidence["member_id"]),
    支払方法: paymentEvidence_toDisplayPaymentMethod_(evidence["payment_method"]),
    入金額: Number(evidence["amount"] || 0),
    決済ID: normalizeId_(evidence["evidence_id"]),
    備考: evidence["remarks"] || "09_決済エビデンスから06へ反映"
  };
}

/**
 * ROLE
 * PaymentEvidenceRequest / Register
 *
 * RESPONSIBILITY
 * 09_決済エビデンスへ登録する。
 */function paymentEvidencePost_register(payment, ctx) {
  return payment_register(payment, ctx);
}


// ==============================
// POSTED更新
// ==============================
function paymentEvidencePost_updatePosted(input, ctx) {
  ctx = ensureSheetContext(ctx);

  const target = paymentEvidence_findRowById_(input.evidence_id, ctx);
  if (!target) {
    throw new Error("post: 決済エビデンスが見つかりません: " + input.evidence_id);
  }

  paymentEvidence_updateColumns_(target.rowNumber, {
    status: "POSTED",
    posted_at: sup_now(ctx),
    payment_log_id: input.payment_log_id
  }, ctx);

  return {
    ok: true,
    evidence_id: input.evidence_id,
    payment_log_id: input.payment_log_id,
    status: "POSTED"
  };
}

function paymentEvidence_toDisplayPaymentMethod_(value) {
  const method = paymentEvidence_normalizePaymentMethod_(value);
  if (method === "CASH") return "現金";
  if (method === "PAYPAY") return "PayPay";
  return method;
}
