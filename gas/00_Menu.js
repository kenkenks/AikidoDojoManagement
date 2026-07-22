//--------------------------
// シートメニュー
//--------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("道場管理")
    .addItem("請求明細を生成", "generateInvoices")
    .addSeparator()
    .addItem("会員カードを作成", "generateMemberCards")
    .addItem("会員カードテンプレート作成", "createMemberCardTemplate")
    .addSeparator()
    .addItem("現金要求を更新", "showCashRequests")
    .addItem("現金受け取り確認(一覧)", "showCashConfirmDialog")
    .addSeparator()
    .addItem("テスト時刻を設定", "showTimeTravelDialog")
    .addSeparator()
    .addItem("デバック実行用", "debug_run")
    .addToUi();
}

/**
 * 管理シートを最新化し、シート名とジャンプリンクを生成
 */
function syncSheetList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const listSheet = ss.getSheetByName("00_管理") || ss.insertSheet("00_管理");
  
  listSheet.clear();
  listSheet.appendRow(["シート名", "表示切替", "ジャンプ"]);
  
  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name !== "00_管理") {
      // B列にチェックボックスを設置（表示中ならチェックON）
      const row = listSheet.getLastRow() + 1;
      listSheet.appendRow([name, !sheet.isSheetHidden(), `=HYPERLINK("#gid=${sheet.getSheetId()}", "移動")`]);
      listSheet.getRange(row, 2).insertCheckboxes();
    }
  });
}

/**
 * チェックボックスの変更を検知して表示/非表示を切り替えるトリガー
 */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  
  // 00_管理シートのB列が編集された時のみ動作
  if (sheet.getName() === "00_管理" && range.getColumn() === 2 && range.getRow() > 1) {
    const targetSheetName = sheet.getRange(range.getRow(), 1).getValue();
    const targetSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(targetSheetName);
    
    if (targetSheet) {
      e.value === "TRUE" ? targetSheet.showSheet() : targetSheet.hideSheet();
    }
  }
}
