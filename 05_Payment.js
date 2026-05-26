// 05_Payment.gs
//  入金ログを書く
//  支払済へ更新する
//  支払合計を計算する

// ==============================
// 入金・支払状態
// ==============================

function getPaidTotal(payments, targetMonth, billingGroupId) {

  return payments
    .filter(p =>
      normalizeMonth(p["target_month"]) === normalizeMonth(targetMonth) &&
      String(p["billing_group_id"]).trim() === String(billingGroupId).trim()
    )
    .reduce((sum, p) => sum + Number(p["金額"] || 0), 0);
}


// 請求状態更新関数
function updateInvoiceStatusByPayment(payments, targetMonth, billingGroupId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invoiceSheet = ss.getSheetByName("05_請求明細");

  const values = invoiceSheet.getDataRange().getValues();
  const headers = values[0];

  const col = {};
  headers.forEach((h, i) => col[h] = i);

  const paidTotal = getPaidTotal(payments, targetMonth, billingGroupId);

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    if (
      normalizeMonth(row[col["target_month"]]) === normalizeMonth(targetMonth) &&
      String(row[col["billing_group_id"]]).trim() === String(billingGroupId).trim()
    ) {
      const amount = Number(row[col["金額"]] || 0);
      const status = paidTotal >= amount ? "支払済" : "未払い";

      invoiceSheet
        .getRange(r + 1, col["支払状態"] + 1)
        .setValue(status);
    }
  }
}

//
// ================================
// 将来：自動決済連携用（共通処理）
// ================================
//
function markAsPaidByGroup(targetMonth, billingGroupId, amount, extTxId, note) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invoiceSheet = ss.getSheetByName("05_請求明細");
  const paymentSheet = ss.getSheetByName("06_入金ログ");

  const values = invoiceSheet.getDataRange().getValues();
  const headers = values[0];

  const col = {};
  headers.forEach((h, i) => col[h] = i);

  let total = 0;
  let updated = 0;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    if (
      normalizeMonth(row[col["target_month"]]) === targetMonth &&
      row[col["billing_group_id"]] === billingGroupId &&
      row[col["支払状態"]] === "未払い"
    ) {
      total += Number(row[col["金額"]] || 0);
      invoiceSheet.getRange(r + 1, col["支払状態"] + 1).setValue("支払済");
      updated++;
    }
  }

  // 二重登録防止（外部トランザクションID）
  const logs = readSheet(paymentSheet);
  if (extTxId && logs.some(l => l["外部取引ID"] === extTxId)) {
    return { ok: true, message: "既に処理済み（重複防止）" };
  }

  paymentSheet.appendRow([
    "PAY-" + Utilities.getUuid().slice(0, 8),
    new Date(),
    billingGroupId,
    "",
    "PayPay",
    amount,
    extTxId || "MANUAL",
    note || ""
  ]);

  return { ok: true, message: `${amount}円を反映しました` };
}  


//請求明細更新用の共通関数
function markInvoicesPaid(targetMonth, billingGroupId) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Browser.msgBox(`支払いグループID: ${billingGroupId}`);

  const invoiceSheet =
    ss.getSheetByName("05_請求明細");

  const values =
    invoiceSheet.getDataRange().getValues();

  const headers = values[0];

  const col = {};

  headers.forEach((h, i) => col[h] = i);

  let updated = 0;

  for (let r = 1; r < values.length; r++) {

    const row = values[r];

    const rowMonth =
      normalizeMonth(row[col["target_month"]]);

    const rowGroup =
      String(row[col["billing_group_id"]]).trim();

    const targetGroup =
      String(billingGroupId).trim();

    const status =
      row[col["支払状態"]];

    if (
      rowMonth === targetMonth &&
      rowGroup === targetGroup &&
      status === "未払い"
    ) {

      invoiceSheet
        .getRange(r + 1, col["支払状態"] + 1)
        .setValue("支払済");

      updated++;
    }
  }

  Logger.log(`updated=${updated}`);
}
