//--------------------------
// Webコントロール
//--------------------------
// Webアプリの入口は Code.js の doGet に統合済み。
// 旧処理は参照用として別名で残す。
function doGetLegacy_(e) {
  const action = e.parameter.action || "";

  Logger.log("action=" + action);

  if (action === "getMemberInfo") {
    const memberId = e.parameter.member_id || "";
    const callback = e.parameter.callback || "";

    const result = getMemberInfoForPayment(memberId);
    const json = JSON.stringify(result);

    if (callback) {
      return ContentService
        .createTextOutput(callback + "(" + json + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService
      .createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 既存の会費確認画面
  const memberId = e.parameter.member_id || "";
  const template = HtmlService.createTemplateFromFile("index");
  template.memberId = memberId;

  return template.evaluate()
    .setTitle("道場会費確認")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}



// function doPost(e) {
//   try {
//     const body = JSON.parse(e.postData.contents);

//     // ★ここはPayPayの実仕様に合わせてマッピング
//     const targetMonth = body.target_month;              // 例
//     const billingGroupId = body.billing_group_id;       // 例
//     const amount = Number(body.amount || 0);
//     const extTxId = body.transaction_id;                // 外部トランザクションID

//     // ★署名検証（本番で必須：HMACなど）
//     // verifySignature(e);

//     const res = markAsPaidByGroup(targetMonth, billingGroupId, amount, extTxId, "Webhook");

//     return ContentService
//       .createTextOutput(JSON.stringify(res))
//       .setMimeType(ContentService.MimeType.JSON);

//   } catch (err) {
//     return ContentService
//       .createTextOutput(JSON.stringify({ ok: false, message: err.message }))
//       .setMimeType(ContentService.MimeType.JSON);
//   }
// }
