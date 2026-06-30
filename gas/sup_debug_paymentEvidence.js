// ================================
// 09_決済エビデンス バッチ
// ================================
//
// 決済エビデンス一括受付テスト
// 1(05 -> 09) => 2(09:決済コード) => 3(09 -> 06, 20)　バッチ
//             paymentEvidence_acceptBatch
function debug_paymentEvidence_acceptBatch() {

  const ctx = createSheetContext();

  const invoices = getInvoices(ctx);
  const teacher_id = "T001";

  const payment_items = invoices
    .filter(function(invoice) {

      // 未払いのみ
      if (invoice["支払状態"] !== "未払い") return false;

      // 金額ありのみ
      if (Number(invoice["請求予定額"] || 0) <= 0) return false;

      return true;

    })
    .map(function(invoice, index) {

      const isCash = (index % 2 === 0);

      return {
        invoice_id: invoice.invoice_id,
        member_id: invoice.member_id,
        payment_method: isCash ? "CASH" : "PAYPAY",

        // PayPayのみ決済コードを仮設定
        evidence_code: isCash
          ? "CASH-" + invoice.invoice_id + "-CONFIRMED"
          : "PAYPAY-" + Utilities.getUuid().substring(0, 8),
        teacher_id: teacher_id,

        remarks: "debug accept batch"

      };

    });

  const input = {
    mode: "payment_batch",
    teacher_id: teacher_id,
    payments: payment_items,
    count: 1,
    source: "payment_teacher.html"
  };
  
  // sup_logDebug("debug_paymentEvidence_acceptBatch input", {
  //       result: JSON.stringify(result, null, 2)
  // });
  

  //============ テスト対象
  //============
   const result = paymentEvidence_acceptBatch(input, ctx);
 
    sup_logDebug("debug_paymentEvidence_acceptBatch", {

    count: payment_items.length,

    result: JSON.stringify(result, null, 2)

  });

  return result;

}

//
// 09 REQUESTED 複数作成
// 1(05 -> 09) バッチ
//             paymentEvidence_requestBatch
function debug_paymentEvidence_requestBatch() {
  const ctx = createSheetContext();

  const invoices = getInvoices(ctx);

  const paymentItems = invoices
    .filter(function(invoice) {
      return invoice.invoice_id;
    })
    .map(function(invoice, index) {
      return {
        invoice_id: invoice.invoice_id,
        member_id: invoice.member_id,
        payment_method: index % 2 === 0 ? "CASH" : "PAYPAY",
        remarks: "debug all invoices"
      };
    });

  const input = {
    teacher_id: "T001",
    payment_items: paymentItems
  };

  //============ テスト対象
  //============
  const result = paymentEvidence_requestBatch(input, ctx);

  sup_logDebug("debug_paymentEvidence_requestBatch", {
    count: paymentItems.length,
    result: JSON.stringify(result, null, 2)
  });

  return result;
}

//
// 09 REQUESTED → CONFIRMED 一括確認デバッグ
// 2(09:決済コード)
//             paymentEvidence_recordBatch
function debug_paymentEvidence_recordBatch() {
  const ctx = createSheetContext();

  const evidences = getPaymentEvidences(ctx);

  const requested = evidences.filter(function(evidence) {
    return evidence.status === "REQUESTED";
  });

  const evidence_items = requested.map(function(evidence) {
    return {
      evidence_id: evidence.evidence_id,

      // 請求IDを加工して決済コードにする
      evidence_code: makeDebugEvidenceCodeFromInvoiceId_(
        evidence.invoice_id,
        evidence.payment_method
      ),

      remarks: "debug record batch"
    };
  });

  const input = {
    teacher_id: "T001",
    evidence_items: evidence_items
  };

  //============ テスト対象
  //============
  const result = paymentEvidence_recordBatch(input, ctx);

  sup_logDebug("debug_paymentEvidence_recordBatch", {
    requested_count: requested.length,
    evidence_items: evidence_items,
    result: JSON.stringify(result, null, 2)
  });

  return result;
}

//
// デバッグ用：invoice_id から決済コードを作る
//
function makeDebugEvidenceCodeFromInvoiceId_(invoice_id, payment_method) {
  const method = payment_method || "PAYMENT";
  const invoicePart = String(invoice_id || "")
    .replace(/^INV-/, "")
    .replace(/[^A-Za-z0-9]/g, "-");

  return method + "-DEBUG-" + invoicePart;
}

// CONFIRMED をまとめて06へ反映する。
// 3(09 -> 06, 20)
//             paymentEvidence_postBatch
function debug_paymentEvidence_postBatch() {
  const ctx = createSheetContext();

  //============ テスト対象
  //============
  const result = paymentEvidence_postBatch(ctx);

  sup_logDebug("debug_paymentEvidence_postBatch", {
    result: JSON.stringify(result, null, 2)
  });

  return result;
}

//
// ================================
// 09_決済エビデンス 1件処理
// ================================
//

// 09 REQUESTED 単体作成
// 1(05 -> 09) 
//             paymentEvidence_request
function debug_paymentEvidence_request() {
  const ctx = createSheetContext();

  const input = {
    // invoice_id が分かるなら指定
    // 空なら member_id から当月未払い請求を探す実装
    invoice_id: "INV-2026-06-G001-M001-c5fb069c",  // 毎回書き換え必要
    member_id: "M001",
    payment_method: "CASH",
    amount: 1500,
    remarks: "debug: 09要求作成"
  };

  //============ テスト対象
  //============
  const result = paymentEvidence_request(input, ctx);

  sup_logDebug("debug_paymentEvidence_request", {
    input,
    result: JSON.stringify(result, null, 2)
  });

  return result;
}

//
// 09 REQUESTED → CONFIRMED
// 2(09:決済コード)
//             paymentEvidence_record
function debug_paymentEvidence_record() {
  const ctx = createSheetContext();

  const input = {
    evidence_id: "CASH-58896a58", // 09に作成された evidence_id に差し替え
    evidence_code: "CASH-58896a58-Fine",
    confirmed_by: "T001",
    remarks: "debug: 先生確認済"
  };

  //============ テスト対象
  //============
  const result = paymentEvidence_record(input, ctx);

  sup_logDebug("debug_paymentEvidence_record", {
    input,
    result: JSON.stringify(result, null, 2)
  });

  return result;
}

//
// 09 CONFIRMED → 06 入金ログ反映 → 09 POSTED
// 3(09 -> 06, 20)
//             paymentEvidence_post
function debug_paymentEvidence_post() {
  const ctx = createSheetContext();

  const input = {
    evidence_id: "CASH-58896a58" // CONFIRMED済み evidence_id に差し替え
  };

  //============ テスト対象
  //============
  const result = paymentEvidence_post(input, ctx);

  sup_logDebug("debug_paymentEvidence_post", {
    input,
    result: JSON.stringify(result, null, 2)
  });

  return result;
}
