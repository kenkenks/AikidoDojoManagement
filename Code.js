function doGet(e) {
  const mode = e.parameter.mode || "member";

  if (mode === "qr_test") {
    return HtmlService
      .createHtmlOutputFromFile("qr_test")
      .setTitle("QR読み取り実験")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createHtmlOutputFromFile("index");
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("09_QR実験ログ")
    || ss.insertSheet("09_QR実験ログ");

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "timestamp",
      "member_id",
      "location_id",
      "source",
      "raw"
    ]);
  }

  sheet.appendRow([
    new Date(),
    data.member_id || "",
    data.location_id || "",
    data.source || "",
    e.postData.contents
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}