// ========================================
// 09_PaymentEvidenceRunner.js
// PaymentEvidence Story Runner
// ========================================
//
// TYPE: RUNNER
// AREA: PAYMENT
// TAG: PAYMENT
// TAG: RUNNER
// TAG: STORY-P001
//

// ========================================
// 09_PaymentEvidenceRunner.js
// PaymentEvidence Story Runner
// ========================================
//
// TYPE: RUNNER
// AREA: PAYMENT
// TAG: PAYMENT
// TAG: RUNNER
// TAG: STORY-P001
//
// 001
function runner_payment_story_p001() {
  const startedAt = Date.now();
  const ctx = createSheetContext();

  const story = "STORY-P001";
  const task = "TASK-DEV-014";
  const steps = [];

    function runStep(step, title, fn) {
        const invoices = getInvoices(ctx);

        const paymentItems = invoices
            .filter(function(invoice) {
            if (String(invoice["支払状態"] || "") !== "未払い") return false;
            if (Number(invoice["請求予定額"] || invoice["金額"] || 0) <= 0) return false;
            return true;
            })
            .map(function(invoice, index) {
            return {
                invoice_id: invoice.invoice_id,
                member_id: invoice.member_id,
                payment_method: index % 2 === 0 ? "CASH" : "PAYPAY",
                remarks: "runner STORY-P001"
            };
            });

        requestResult = paymentEvidence_requestBatch({
            teacher_id: "T001",
            payment_items: paymentItems
        }, ctx);

        return {
            ok: requestResult && requestResult.ok !== false,
            count: paymentItems.length,
            requestResult: requestResult,
            message: "REQUESTED作成を実行しました。"
        };
    };

  runStep("Prepare", "PaymentEvidence Runner初期化", function() {
    return {
      ok: true,
      message: "PaymentEvidence Runnerを初期化しました。"
    };
  });

  runStep("Request", "決済エビデンスREQUESTEDを作成する", function() {
    return {
      ok: true,
      message: "Request step skeleton."
    };
  });

  runStep("Judge", "Expected / Actual を判定する", function() {
    return {
      ok: true,
      message: "Judge step skeleton."
    };
  });

  runStep("Verify", "09_決済エビデンスを検証する", function() {
    return {
      ok: true,
      message: "Verify step skeleton."
    };
  });

  const success = steps.filter(function(step) { return step.ok; }).length;
  const failed = steps.filter(function(step) { return !step.ok; }).length;

  const summary = {
    ok: failed === 0,
    story: story,
    task: task,
    total: steps.length,
    success: success,
    failed: failed,
    elapsed_ms: Date.now() - startedAt,
    steps: steps.map(function(step) {
      return {
        ok: step.ok,
        step: step.step,
        title: step.title,
        elapsed_ms: step.elapsed_ms,
        message: step.message,
        result: step.result || null
      };
    })
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

//
// 002
function runner_payment_story_p002() {
  const startedAt = Date.now();
  const ctx = createSheetContext();

  const story = "STORY-P002";
  const task = "TASK-DEV-014";
  const steps = [];

  function runStep(step, title, fn) {
    let requested = getPaymentEvidences(ctx).filter(function(e) {
        return normalizeId_(e.status) === "REQUESTED";
    });

    if (requested.length === 0) {
        const invoices = getInvoices(ctx);

        const paymentItems = invoices
        .filter(function(invoice) {
            if (String(invoice["支払状態"] || "") !== "未払い") return false;
            if (Number(invoice["請求予定額"] || invoice["金額"] || 0) <= 0) return false;
            return true;
        })
        .map(function(invoice, index) {
            return {
            invoice_id: invoice.invoice_id,
            member_id: invoice.member_id,
            payment_method: index % 2 === 0 ? "CASH" : "PAYPAY",
            remarks: "runner STORY-P002 prepare"
            };
        });

        paymentEvidence_requestBatch({
        teacher_id: "T001",
        payment_items: paymentItems
        }, ctx);

        invalidateSheetRows(ctx, "09_決済エビデンス");

        requested = getPaymentEvidences(ctx).filter(function(e) {
        return normalizeId_(e.status) === "REQUESTED";
        });
    }

    return {
        ok: requested.length > 0,
        count: requested.length,
        requested: requested,
        message: requested.length > 0
        ? "REQUESTEDを準備しました。"
        : "REQUESTEDを準備できませんでした。"
    };
};

  let recordResult = null;

  runStep("Prepare", "REQUESTEDを取得する", function() {
    const requested = getPaymentEvidences(ctx).filter(function(e) {
      return normalizeId_(e.status) === "REQUESTED";
    });

    return {
      ok: requested.length > 0,
      count: requested.length,
      requested,
      message: requested.length > 0
        ? "REQUESTEDを取得しました。"
        : "REQUESTEDがありません。先にP001を実行してください。"
    };
  });

  runStep("Record", "決済コードを記録する", function() {
    const requested = getPaymentEvidences(ctx).filter(function(e) {
      return normalizeId_(e.status) === "REQUESTED";
    });

    const evidence_items = requested.map(function(e) {
      return {
        evidence_id: e.evidence_id,
        evidence_code: "RUNNER-" + normalizeId_(e.payment_method) + "-" + Utilities.getUuid().slice(0, 8),
        remarks: "runner STORY-P002"
      };
    });

    recordResult = paymentEvidence_recordBatch({
      teacher_id: "T001",
      evidence_items
    }, ctx);

    return recordResult;
  });

  runStep("Verify", "CONFIRMEDを検証する", function() {
    const confirmed = getPaymentEvidences(ctx).filter(function(e) {
      return normalizeId_(e.status) === "CONFIRMED";
    });

    return {
      ok: confirmed.length > 0,
      confirmed_count: confirmed.length,
      message: confirmed.length > 0
        ? "CONFIRMEDを確認しました。"
        : "CONFIRMEDがありません。"
    };
  });

  const success = steps.filter(s => s.ok).length;
  const failed = steps.filter(s => !s.ok).length;

  const summary = {
    ok: failed === 0,
    story,
    task,
    total: steps.length,
    success,
    failed,
    elapsed_ms: Date.now() - startedAt,
    steps
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

//
// 003
function runner_payment_story_p003() {
  const startedAt = Date.now();
  const ctx = createSheetContext();

  const story = "STORY-P003";
  const task = "TASK-DEV-014";
  const steps = [];

  function runStep(step, title, fn) {
    let requested = getPaymentEvidences(ctx).filter(function(e) {
        return normalizeId_(e.status) === "REQUESTED";
    });

    if (requested.length === 0) {
        const invoices = getInvoices(ctx);

        const paymentItems = invoices
        .filter(function(invoice) {
            if (String(invoice["支払状態"] || "") !== "未払い") return false;
            if (Number(invoice["請求予定額"] || invoice["金額"] || 0) <= 0) return false;
            return true;
        })
        .map(function(invoice, index) {
            return {
            invoice_id: invoice.invoice_id,
            member_id: invoice.member_id,
            payment_method: index % 2 === 0 ? "CASH" : "PAYPAY",
            remarks: "runner STORY-P002 prepare"
            };
        });

        paymentEvidence_requestBatch({
        teacher_id: "T001",
        payment_items: paymentItems
        }, ctx);

        invalidateSheetRows(ctx, "09_決済エビデンス");

        requested = getPaymentEvidences(ctx).filter(function(e) {
        return normalizeId_(e.status) === "REQUESTED";
        });
    }

    return {
        ok: requested.length > 0,
        count: requested.length,
        requested: requested,
        message: requested.length > 0
        ? "REQUESTEDを準備しました。"
        : "REQUESTEDを準備できませんでした。"
    };
};

  let recordResult = null;

  runStep("Prepare", "REQUESTEDを取得する", function() {
    const requested = getPaymentEvidences(ctx).filter(function(e) {
      return normalizeId_(e.status) === "REQUESTED";
    });

    return {
      ok: requested.length > 0,
      count: requested.length,
      requested,
      message: requested.length > 0
        ? "REQUESTEDを取得しました。"
        : "REQUESTEDがありません。先にP001を実行してください。"
    };
  });

  runStep("Record", "決済コードを記録する", function() {
    const requested = getPaymentEvidences(ctx).filter(function(e) {
      return normalizeId_(e.status) === "REQUESTED";
    });

    const evidence_items = requested.map(function(e) {
      return {
        evidence_id: e.evidence_id,
        evidence_code: "RUNNER-" + normalizeId_(e.payment_method) + "-" + Utilities.getUuid().slice(0, 8),
        remarks: "runner STORY-P002"
      };
    });

    recordResult = paymentEvidence_recordBatch({
      teacher_id: "T001",
      evidence_items
    }, ctx);

    return recordResult;
  });

  runStep("Verify", "CONFIRMEDを検証する", function() {
    const confirmed = getPaymentEvidences(ctx).filter(function(e) {
      return normalizeId_(e.status) === "CONFIRMED";
    });

    return {
      ok: confirmed.length > 0,
      confirmed_count: confirmed.length,
      message: confirmed.length > 0
        ? "CONFIRMEDを確認しました。"
        : "CONFIRMEDがありません。"
    };
  });

  const success = steps.filter(s => s.ok).length;
  const failed = steps.filter(s => !s.ok).length;

  const summary = {
    ok: failed === 0,
    story,
    task,
    total: steps.length,
    success,
    failed,
    elapsed_ms: Date.now() - startedAt,
    steps
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

//
// 004
function runner_payment_story_p004() {
  const startedAt = Date.now();
  const ctx = createSheetContext();

  const story = "STORY-P004";
  const task = "TASK-DEV-014";
  const steps = [];

  function runStep(step, title, fn) {
    let requested = getPaymentEvidences(ctx).filter(function(e) {
        return normalizeId_(e.status) === "REQUESTED";
    });

    if (requested.length === 0) {
        const invoices = getInvoices(ctx);

        const paymentItems = invoices
        .filter(function(invoice) {
            if (String(invoice["支払状態"] || "") !== "未払い") return false;
            if (Number(invoice["請求予定額"] || invoice["金額"] || 0) <= 0) return false;
            return true;
        })
        .map(function(invoice, index) {
            return {
            invoice_id: invoice.invoice_id,
            member_id: invoice.member_id,
            payment_method: index % 2 === 0 ? "CASH" : "PAYPAY",
            remarks: "runner STORY-P002 prepare"
            };
        });

        paymentEvidence_requestBatch({
        teacher_id: "T001",
        payment_items: paymentItems
        }, ctx);

        invalidateSheetRows(ctx, "09_決済エビデンス");

        requested = getPaymentEvidences(ctx).filter(function(e) {
        return normalizeId_(e.status) === "REQUESTED";
        });
    }

    return {
        ok: requested.length > 0,
        count: requested.length,
        requested: requested,
        message: requested.length > 0
        ? "REQUESTEDを準備しました。"
        : "REQUESTEDを準備できませんでした。"
    };
};

  let recordResult = null;

  runStep("Prepare", "REQUESTEDを取得する", function() {
    const requested = getPaymentEvidences(ctx).filter(function(e) {
      return normalizeId_(e.status) === "REQUESTED";
    });

    return {
      ok: requested.length > 0,
      count: requested.length,
      requested,
      message: requested.length > 0
        ? "REQUESTEDを取得しました。"
        : "REQUESTEDがありません。先にP001を実行してください。"
    };
  });

  runStep("Record", "決済コードを記録する", function() {
    const requested = getPaymentEvidences(ctx).filter(function(e) {
      return normalizeId_(e.status) === "REQUESTED";
    });

    const evidence_items = requested.map(function(e) {
      return {
        evidence_id: e.evidence_id,
        evidence_code: "RUNNER-" + normalizeId_(e.payment_method) + "-" + Utilities.getUuid().slice(0, 8),
        remarks: "runner STORY-P002"
      };
    });

    recordResult = paymentEvidence_recordBatch({
      teacher_id: "T001",
      evidence_items
    }, ctx);

    return recordResult;
  });

  runStep("Verify", "CONFIRMEDを検証する", function() {
    const confirmed = getPaymentEvidences(ctx).filter(function(e) {
      return normalizeId_(e.status) === "CONFIRMED";
    });

    return {
      ok: confirmed.length > 0,
      confirmed_count: confirmed.length,
      message: confirmed.length > 0
        ? "CONFIRMEDを確認しました。"
        : "CONFIRMEDがありません。"
    };
  });

  const success = steps.filter(s => s.ok).length;
  const failed = steps.filter(s => !s.ok).length;

  const summary = {
    ok: failed === 0,
    story,
    task,
    total: steps.length,
    success,
    failed,
    elapsed_ms: Date.now() - startedAt,
    steps
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

