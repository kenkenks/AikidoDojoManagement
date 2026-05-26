//出席登録関数を追加
function registerAttendance(memberId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const memberSheet = ss.getSheetByName("01_会員マスタ");
  const feeSheet = ss.getSheetByName("03_料金マスタ");
  const paymentSheet = ss.getSheetByName("06_入金ログ");
  const attendanceSheet = ss.getSheetByName("07_出席ログ");

  const members = readSheet(memberSheet);
  const fees = readSheet(feeSheet);
  const payments = readSheet(paymentSheet);
  const attendances = readSheet(attendanceSheet);

  const targetMonth = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM"
  );

  const selection = getMonthlySelection(memberId, targetMonth);

  if (!selection) {
    return {
      ok: false,
      message: "今月の会費タイプが未宣言です。先に会費タイプを選択してください。"
    };
  }

  attendanceSheet.appendRow([
    "ATT-" + Utilities.getUuid().slice(0, 8),
    new Date(),
    memberId,
    targetMonth,
    ""
  ]);

  if (selection["会費タイプ"] === "回数料金") {
    return updatePerVisitInvoice(members, fees, payments, attendances, memberId, targetMonth);
  }

  if (selection["会費タイプ"] === "月会費") {
    createOrUpdateMonthlyInvoice(memberId, targetMonth, "月会費");
    return {
      ok: true,
      message: "出席を登録しました。月会費は登録済みです。"
    };
  }

  if (selection["会費タイプ"] === "休会") {
    return {
      ok: false,
      message: "休会中のため出席登録できません。"
    };
  }

  return {
    ok: true,
    message: "出席を登録しました。"
  };
}
