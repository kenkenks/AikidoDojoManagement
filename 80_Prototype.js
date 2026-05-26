// 80_Prototype.gs
//  デモ支払い
//
// デモPay
//
function demoPay(memberId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const memberSheet = ss.getSheetByName("01_会員マスタ");
    const paymentSheet = ss.getSheetByName("06_入金ログ");

    const members = readSheet(memberSheet);
  
    const member = members.find(m =>
      String(m["member_id"]).trim() === String(memberId).trim()
    );

    if (!member) {
      return { ok: false, message: "会員が見つかりません" };
    }

    const targetMonth = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

    const billingGroupId = member["請求グループID"];

    const status = getPaymentStatus(memberId);

    if (!status.ok) {
      return status;
    }

    const unpaidAmount = Number(status.unpaidAmount || 0);

    if (unpaidAmount <= 0) {
      return { ok: false, message: "未払いの請求はありません" };
    }

    const paymentId = "PAY-" + Utilities.getUuid().slice(0, 8);

    paymentSheet.appendRow([
      paymentId,
      new Date(),
      targetMonth,
      billingGroupId,
      "",
      "デモ支払い",
      unpaidAmount,
      "DEMO",
      "デモ画面から支払済登録"
    ]);

    // appendRow 後に再読込する
    const paymentsAfter = readSheet(paymentSheet);

    updateInvoiceStatusByPayment(
      paymentsAfter,
      targetMonth,
      billingGroupId
    );

    return {
      ok: true,
      message: `${unpaidAmount}円を支払済にしました`
    };

  } catch (e) {
    return { ok: false, message: e.message };
  }
}
