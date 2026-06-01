//--------------------------
// Webコントロール
//--------------------------
function doGet(e) {

  const mode = e.parameter.mode || "status";
  const memberId = e.parameter.member_id || "";

  let fileName;
  let title;

  switch(mode) {

    case "pay":
      fileName = "payment";
      title = "道場会費集金";
      break;

    case "status":
    default:
      fileName = "index";
      title = "道場会費確認";
      break;
  }

  const template =
    HtmlService.createTemplateFromFile(fileName);

  template.memberId = memberId;
  template.mode = mode;

  return template.evaluate()
    .setTitle(title)
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );
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

