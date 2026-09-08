//
// 09_PaymentEvidenceAccept.js
//
// -----------------------------------------------------------------------------
// 決済エビデンス一括受付
// -----------------------------------------------------------------------------
//
// 【概要】
// QR受付画面から送信された受付済データを一括処理する。
// 現金確認済・PayPay決済確認済の受付データを対象とし、
// 決済エビデンス登録から入金反映までを一括で実行する。
//
// 【処理フロー】
// ① createPaymentEvidenceRequestBatch()
//      ↓
//      09_決済エビデンス
//      status = REQUESTED
//
// ② recordPaymentEvidenceBatch()
//      ↓
//      status = CONFIRMED
//
// ③ postConfirmedPaymentEvidenceBatch()
//      ↓
//      06_入金ログ登録
//      05_請求明細更新
//      20_会費状態View更新
//      09_決済エビデンス
//      status = POSTED
//
// 【呼び出し元】
// Code.js
// doPost()
//   mode = "payment_batch"
//
// 【備考】
// ・QR画面では複数名をまとめて受付する。
// ・REQUESTED は内部状態として生成される。
// ・通常運用では REQUESTED → CONFIRMED → POSTED を
//   本ファイル内で連続実行する。
// ・個別の Request / Record / Post は
//   デバッグ・障害復旧・保守用途として残す。
//
// -----------------------------------------------------------------------------

//
// -----------------------------------------------------------------------------
// 運用フロー
// -----------------------------------------------------------------------------


// QR読み取り系（QR読み取りサイトのフロー）
// -----------------------------------------------------------------------------
// キーQR（道場・先生）
//     ↓ 支払い開始
// 支払い用QR（会員＋plan_id）
//     ↓ QRスキャン
//     ↓ 会員情報・会費情報取得（GET）
//     ↓ 04_月次選択
//     ↓ 05_請求明細
//     ↓ 20_会費状態View 更新
//
// 表示系
// -----------------------------------------------------------------------------
// 会員会費情報表示
//
// [現金] [PayPay]
//     ↓
//     ↓ 受付済一覧へ追加
//     ↓
// [次の会員へ]
//     ↓
//
// -----------------------------------------------------------------------------
// 受付済一覧
//
// 山田太郎様  7,500円  PayPay  [決済コード取得] [削除]
// ＊＊＊＊様   1,500円  現金    [現金確認済]    [削除]
//
// -----------------------------------------------------------------------------
// 現金      : 1,500円
// PayPay   : 7,500円
// 合計      : 9,000円
// 受付人数  : 2
//
// [集計完了]
//     ↓ POST
//     ↓
// paymentEvidence_acceptBatch()
//     ↓
// ① paymentEvidence_requestBatch()
//     ↓
// ② paymentEvidence_recordBatch()
//     ↓
// ③ paymentEvidence_postBatch()
//     ↓
// 09_決済エビデンス
// 06_入金ログ
// 05_請求明細更新
// 20_会費状態View更新
//
// -----------------------------------------------------------------------------
// PayPay決済コード取得
// -----------------------------------------------------------------------------
// ・手入力（初期実装）
// ・カメラ読み取り（将来対応）
// ・OCR（将来対応）
//
// -----------------------------------------------------------------------------

function paymentEvidence_acceptBatch(data, ctx) {
  ctx = ensureSheetContext(ctx);

  const locationId = normalizeId_(data && data.location_id);
  const billingBlockId = normalizeId_(data && data.billing_block_id);
  const teacherId = normalizeId_(data && data.teacher_id);
  const source = normalizeId_(data && data.source);
  const inputPayments = Array.isArray(data && data.payment_items)
    ? data.payment_items
    : (Array.isArray(data && data.payments) ? data.payments : []);

  // 現仕様では先生会費受付画面は現金専用。
  // PayPay は会員PayPay画面 -> 09 CONFIRMED -> 先生の決済更新で処理する。
  if (source === "payment_teacher.html") {
    const nonCash = inputPayments.find(function(payment) {
      const method = paymentEvidence_normalizePaymentMethod_(payment.payment_method || payment.paymentMethod || "");
      return method !== "CASH";
    });
    if (nonCash) {
      return { ok: false, message: "accept: 先生会費受付画面から登録できるのは現金のみです。" };
    }
  }
  if (!locationId || !billingBlockId || !teacherId) {
    return { ok: false, message: "accept: 先生・道場・課金枠を指定してください。" };
  }
  validatePaymentMasterData_(ctx, teacherId, locationId, billingBlockId);
  paymentReception_ensureSchema(ctx);

  sup_logDebug("paymentEvidence_recordBatch start", {
    result: JSON.stringify(data, null, 2)
  }, ctx);

  const requestResult = paymentEvidence_requestBatch(data, ctx);

  const records = requestResult.records || requestResult.created || [];
  if (records.length === 0) {
    return {
      ok: false,
      message: "accept: 決済エビデンスが見つかりません。"
    };
  }
  const data_payment_items = data.payment_items || data.payments || [];

  const evidence_items = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const data_payment_item = data_payment_items[i] || {};
    if (record.ok === true) {
      evidence_items.push({
        evidence_id: record.evidence_id || "",                              // by paymentEvidence_requestBatch()
        evidence_code: data_payment_item.evidence_code || record.evidence_id + "-OK",
        confirmed_by: data_payment_item.teacher_id || data.teacher_id || "",
        remarks: data_payment_item.remarks || ""
      });
    } else {
      sup_logDebug("debug_paymentEvidence_recordBatch_before", {
        result: JSON.stringify("エビデンス情報がありません" + record.member_id, null, 2)
      }, ctx);
    }          
  }

  sup_logDebug("debug_paymentEvidence_recordBatch_before", {
    evidence_items: evidence_items,
    result: JSON.stringify(requestResult, null, 2)
  }, ctx);

  const input = {
    teacher_id: data.teacher_id || "",
    evidence_items: evidence_items
  };

  const recordResult = paymentEvidence_recordBatch(input, ctx);

  sup_logDebug("debug_paymentEvidence_recordBatch_after", {
    evidence_items: evidence_items,
    result: JSON.stringify(recordResult, null, 2)
  }, ctx);

  // この受付バッチで確認したEvidenceだけを06へ反映する。
  // paymentEvidence_postBatch() は全CONFIRMEDを対象にするため、
  // 会員PayPay画面で作られた別受付のEvidenceまで巻き込む危険がある。
  const postResults = [];
  for (let i = 0; i < evidence_items.length; i++) {
    const evidenceId = normalizeId_(evidence_items[i].evidence_id);
    if (!evidenceId) continue;
    try {
      const result = paymentEvidence_post({ evidence_id: evidenceId }, ctx);
      postResults.push({ ok: true, evidence_id: evidenceId, result: result });
    } catch (e) {
      postResults.push({ ok: false, evidence_id: evidenceId, message: e.message });
    }
  }
  const postResult = {
    ok: postResults.every(function(result) { return result.ok; }),
    results: postResults,
    posted: postResults.filter(function(result) { return result.ok; }),
    skipped: postResults.filter(function(result) { return !result.ok; }),
    message: "accept: この受付バッチの決済エビデンスだけを06へ反映しました。"
  };

  return {
    ok: true,
    requestResult: requestResult,
    recordResult: recordResult,
    postResult: postResult
  };
}
