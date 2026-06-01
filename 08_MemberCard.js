//
// ================================
// ユーティリティ機能
// ================================
//

// 会員カード生成
function generateMemberCards() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const memberSheet = ss.getSheetByName("01_会員マスタ");

  let cardSheet = ss.getSheetByName("08_会員カード");

  if (!cardSheet) {
    cardSheet = ss.insertSheet("08_会員カード");
  }

  cardSheet.clear();

  const headers = [
    "member_id",
    "氏名",
    "URL",
    "QR"
  ];

  cardSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const members = readSheet(memberSheet);

  const webAppUrl = ScriptApp.getService().getUrl();

  const rows = [];

  members.forEach(member => {

    if (member["状態"] === "退会") return;

    const memberId = member["member_id"];

    const url =
      webAppUrl +
      "?member_id=" +
      encodeURIComponent(memberId);

    const qrFormula =
      `=IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" & ENCODEURL(C${rows.length + 2}))`;

    rows.push([
      memberId,
      member["氏名"],
      url,
      qrFormula
    ]);
  });

  if (rows.length > 0) {
    cardSheet
      .getRange(2, 1, rows.length, headers.length)
      .setValues(rows);
  }

  Browser.msgBox(`${rows.length}件の会員カードを作成しました。`);
} 

// 会員カードテンプレート
function createMemberCardTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName("08_会員カード_テンプレート");
  if (!sheet) {
    sheet = ss.insertSheet("08_会員カード_テンプレート");
  }

  sheet.clear();

  // レイアウト調整
  sheet.setColumnWidths(1, 1, 120);
  sheet.setColumnWidths(2, 1, 220);
  sheet.setColumnWidths(3, 1, 220);
  sheet.setRowHeights(1, 12, 36);
  sheet.setRowHeight(8, 180);

  // 入力欄
  sheet.getRange("A1").setValue("会員ID");
  sheet.getRange("B1").setValue("M001");
  sheet.getRange("A1:B1").setFontWeight("bold");

  // カード枠
  sheet.getRange("A3:C10").setBorder(true, true, true, true, true, true);
  sheet.getRange("A3:C3").merge().setValue("道場 会員証")
    .setFontSize(20)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("A5").setValue("氏名");
  sheet.getRange("B5:C5").merge()
    .setFormula('=IFERROR(VLOOKUP($B$1,\'01_会員マスタ\'!A:Z,2,FALSE),"")')
    .setFontSize(18)
    .setFontWeight("bold");

  sheet.getRange("A6").setValue("会員ID");
  sheet.getRange("B6:C6").merge().setFormula("=$B$1");

  sheet.getRange("A7").setValue("区分");
  sheet.getRange("B7:C7").merge()
    .setFormula('=IFERROR(VLOOKUP($B$1,\'01_会員マスタ\'!A:Z,4,FALSE),"")');

  sheet.getRange("A8").setValue("QR");
  sheet.getRange("B8:C10").merge()
    .setFormula(
      '=IF($B$1="","",IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" & ENCODEURL($B$12)))'
    )
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  // URL生成欄
  sheet.getRange("A12").setValue("URL");
  sheet.getRange("B12:C12").merge()
    .setFormula('=$B$14 & "?member_id=" & ENCODEURL($B$1)');

  sheet.getRange("A14").setValue("WebアプリURL");
  sheet.getRange("B14:C14").merge().setValue(getSetting("WEB_APP_URL"));

  // 見た目
  sheet.getRange("A3:C10")
    .setVerticalAlignment("middle")
    .setFontFamily("Arial");

  sheet.getRange("A5:A8").setFontWeight("bold");
  sheet.getRange("A12:A14").setFontWeight("bold");

  sheet.getRange("B14:C14").setWrap(true);
  sheet.getRange("B12:C12").setWrap(true);

  Browser.msgBox("会員カードテンプレートを作成しました。B1に会員IDを入力するとカードが切り替わります。");
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