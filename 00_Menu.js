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
    .addItem("デバック実行用", "debug_run")
    .addToUi();
}