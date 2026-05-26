// 06_CashPayment.gs
//  現金要求を作る
//  現金受領フローを進める
//
// ================================
// 現金支払い要求
// ================================
//
function requestCashPayment(memberId) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const requestSheet =
    ss.getSheetByName("09_現金支払い要求");

  const status = getPaymentStatus(memberId);

  if (!status.ok) {
    return {
      ok: false,
      message: status.message
    };
  }

  const requestId =
    "CASH-" + Utilities.getUuid().slice(0, 8);

  const unpaidAmount = Number(status.unpaidAmount || 0);

  if (unpaidAmount <= 0) {
    return { ok: false, message: "未払いの請求はありません。" };
  }

  requestSheet.appendRow([
    requestId,
    new Date(),
    memberId,
    status.billingGroupId,
    status.targetMonth,
    status.unpaidAmount,
    "要求中"
  ]);

  return {
    ok: true,
    message: "現金支払い要求を送信しました"
  };
}

//要求中の現金支払いを表示
function showCashRequests() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("09_現金支払い要求");

  if (!sheet) {
    Browser.msgBox("09_現金支払い要求 シートがありません。");
    return;
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0];

  const col = {};
  headers.forEach((h, i) => col[h] = i);

  const pending = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    if (row[col["状態"]] === "要求中") {
      pending.push({
        rowNumber: r + 1,
        requestId: row[col["request_id"]],
        memberId: row[col["member_id"]],
        billingGroupId: row[col["billing_group_id"]],
        targetMonth: normalizeMonth(row[col["target_month"]]),
        amount: Number(row[col["金額"]] || 0)
      });
    }
  }

  if (pending.length === 0) {
    Browser.msgBox("要求中の現金支払いはありません。");
    return;
  }

  const message = pending.map(p =>
    `${p.requestId} / ${p.memberId} / ${p.targetMonth} / ${p.amount}円`
  ).join("\n");

  const result = Browser.inputBox(
    "現金支払い要求",
    "受領する request_id を入力してください。\n\n" + message,
    Browser.Buttons.OK_CANCEL
  );

  if (result === "cancel" || !result) return;

  approveCashRequest(result.trim());
}

function showCashConfirmDialog() {
  const html = HtmlService
    .createHtmlOutputFromFile("cash_confirm")
    .setWidth(500)
    .setHeight(600);

  SpreadsheetApp.getUi().showModalDialog(html, "現金受け取り確認");
}

function getPendingCashRequestsForConfirm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const requestSheet = ss.getSheetByName("09_現金支払い要求");
  const memberSheet = ss.getSheetByName("01_会員マスタ");

  const requests = readSheet(requestSheet);
  const members = readSheet(memberSheet);

  return requests
    .filter(r =>
      String(r["状態"]).trim() === "要求中"
    )
    .map(r => {
      const member = members.find(m =>
        String(m["member_id"]).trim() === String(r["member_id"]).trim()
      );

      return {
        requestId: r["request_id"],
        memberId: r["member_id"],
        memberName: member ? member["氏名"] : r["member_id"],
        billingGroupId: r["billing_group_id"],
        targetMonth: normalizeMonth(r["target_month"]),
        amount: Number(r["金額"] || 0),
      };
    });
}

//受領処理
function approveCashRequest(requestId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const requestSheet = ss.getSheetByName("09_現金支払い要求");
  const paymentSheet = ss.getSheetByName("06_入金ログ");
  const invoiceSheet = ss.getSheetByName("05_請求明細");

  const values = requestSheet.getDataRange().getValues();
  const headers = values[0];

  const col = {};
  headers.forEach((h, i) => col[h] = i);

  let targetRow = -1;
  let req = null;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    if (row[col["request_id"]] === requestId) {
      targetRow = r + 1;
      req = {
        memberId: row[col["member_id"]],
        billingGroupId: row[col["billing_group_id"]],
        targetMonth: normalizeMonth(row[col["target_month"]]),
        amount: Number(row[col["金額"]] || 0),
        status: row[col["状態"]]
      };
      break;
    }
  }

  if (!req) {
    Browser.msgBox("指定された request_id が見つかりません。");
    return;
  }

  if (req.status !== "要求中") {
    Browser.msgBox("この要求はすでに処理済みです。");
    return;
  }

  // 入金ログ追加
  const paymentId = "PAY-" + Utilities.getUuid().slice(0, 8);

  paymentSheet.appendRow([
    paymentId,
    new Date(),
    req.targetMonth,
    req.billingGroupId,
    "",
    "現金",
    req.amount,
    requestId,
    "現金支払い要求から受領"
  ]);

  // 請求明細を支払済へ
  markInvoicesPaid(req.targetMonth, req.billingGroupId);

  // 現金要求を受領済へ
  requestSheet.getRange(targetRow, col["状態"] + 1).setValue("受領済");

  Browser.msgBox(`${req.amount}円を現金受領として登録しました。`);
}

function approveCashRequests(requestIds) {
  if (!requestIds || requestIds.length === 0) {
    return {
      ok: false,
      message: "選択された現金要求がありません。"
    };
  }

  let count = 0;

  requestIds.forEach(requestId => {
    approveCashRequest(requestId);
    count++;
  });

  return {
    ok: true,
    message: `${count}件の現金受領を反映しました。`
  };
}