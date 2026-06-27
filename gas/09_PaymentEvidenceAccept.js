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
        evidence_id: record.evidence_id || "",                  // by paymentEvidence_requestBatch();
        evidence_code: data_payment_item.evidence_code  || "",  //外部パラメータ 
        confirmed_by: data_payment_item.teacher_id || "",       //外部パラメータ
        remarks: data_payment_item.remarks || ""                //外部パラメータ
      });
    } else {
      sup_logDebug("debug_paymentEvidence_recordBatch_before", {
        result: JSON.stringify("エビデンス情報がありません" + record.member_id, null, 2)
      });
    }          
  }

  sup_logDebug("debug_paymentEvidence_recordBatch_before", {
    evidence_items: evidence_items,
    result: JSON.stringify(requestResult, null, 2)
  });

  const input = {
    teacher_id: data.teacher_id || "",
    evidence_items: evidence_items
  };

  const recordResult = paymentEvidence_recordBatch(input, ctx);

  sup_logDebug("debug_paymentEvidence_recordBatch_after", {
    evidence_items: evidence_items,
    result: JSON.stringify(recordResult, null, 2)
  });

  const postResult = paymentEvidence_postBatch(ctx);

  return {
    ok: true,
    requestResult: requestResult,
    recordResult: recordResult,
    postResult: postResult
  };
}

