// function doGet(e) {
//   const mode = e.parameter.mode || "member";

//   if (mode === "qr_test") {
//     return HtmlService
//       .createHtmlOutputFromFile("qr_test")
//       .setTitle("QR読み取り実験")
//       .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
//   }

//   return HtmlService.createHtmlOutputFromFile("index");
// }

// function doPost(e) {
//   const data = JSON.parse(e.postData.contents);

//   const ss = SpreadsheetApp.getActiveSpreadsheet();
//   const sheet = ss.getSheetByName("09_QR実験ログ")
//     || ss.insertSheet("09_QR実験ログ");

//   if (sheet.getLastRow() === 0) {
//     sheet.appendRow([
//       "timestamp",
//       "member_id",
//       "location_id",
//       "source",
//       "raw"
//     ]);
//   }

//   sheet.appendRow([
//     new Date(),
//     data.member_id || "",
//     data.location_id || "",
//     data.source || "",
//     e.postData.contents
//   ]);

//   return ContentService
//     .createTextOutput(JSON.stringify({ ok: true }))
//     .setMimeType(ContentService.MimeType.JSON);
// }

function doPost(e) {
  const jsonText = e.postData.contents;
  const data = JSON.parse(jsonText);

  if (Array.isArray(data.member_ids)) {
    appendBatchAttendanceDemoLog(data, jsonText);
  } else {
    appendQrExperimentLog(data, jsonText);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendBatchAttendanceDemoLog(data, raw) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("QR_出席登録デモログ");

  const now = new Date();

  const rows = data.member_ids.map(memberId => [
    now,
    data.teacher_id || "",
    data.location_id || "",
    memberId,
    data.source || "",
    raw
  ]);

  if (rows.length > 0) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);
  }
}

function appendQrExperimentLog(data, raw) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("QR実験ログ");

  sheet.appendRow([
    new Date(),
    data.member_id || "",
    data.location_id || "",
    data.source || "",
    raw
  ]);
}

// 会員会費情報取得
function getMemberInfoForPayment(memberId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("01_会員マスタ");
  const values = sheet.getDataRange().getValues();

  const headers = values[0];

  const idCol = headers.indexOf("会員ID");
  const nameCol = headers.indexOf("氏名");

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    if (row[idCol] === memberId) {
      return {
        success: true,
        memberId: row[idCol],
        memberName: row[nameCol]
      };
    }
  }

  return {
    success: false,
    message: "会員が見つかりません: " + memberId
  };
}