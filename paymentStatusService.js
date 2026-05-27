// ==============================
// 会費状態取得
// ==============================

function buildPaymentStatusViewRow(memberId, targetMonth, ctx) {
  ctx = ctx || loadPaymentStatusContext();

  // ctx.members
  // ctx.fees
  // ctx.selections
  // ctx.invoices
  // ctx.payments
  // ctx.attendances
  // ctx.cashRequests

  return {
    target_month: targetMonth,
    member_id: memberId,
    billing_group_id: billingGroupId,
    会員名: memberName,
    会費タイプ: planType,
    請求額: billedTotal,
    入金額: paidTotal,
    未払い額: unpaidAmount,
    is_paid: isPaid,
    支払状態: status,
    月額上限: monthlyCap,
    出席回数: lessonCount,
    is_capped: isCapped,
    本日出席済み: todayAttendanceRegistered,
    現金支払要求未完了数: cashRequestsLen,
    メッセージ: message,
    更新日時: new Date()
  };
}

function loadPaymentStatusContext(memberId) {
  const t0 = Date.now();
  
  perfLog("START getPaymentStatus", t0);

  //==> シート読み込み
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName("01_会員マスタ");
  const feeSheet = ss.getSheetByName("03_料金マスタ");
  const invoiceSheet = ss.getSheetByName("05_請求明細");
  const paymentSheet = ss.getSheetByName("06_入金ログ");
  const attendanceSheet = ss.getSheetByName("07_出席ログ");
  const cashRequestsSheet = ss.getSheetByName("09_現金支払い要求");

  const members = readSheet(memberSheet);
  const fees = readSheet(feeSheet);
  let invoices = readSheet(invoiceSheet);
  const payments = readSheet(paymentSheet);
  const attendances = readSheet(attendanceSheet);
  const cashRequests = readSheet(cashRequestsSheet);

  const cashRequestsByMemberId = filterBySheet(memberId, cashRequests, "状態", "要求中");
  const cashRequestsLen = cashRequestsByMemberId.length;
  const targetMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");

  const cashPayCount = filterBySheetByDate(memberId, cashRequests, "target_month", targetMonth).length;
  const lessonCount = filterBySheetByDate(memberId, attendances, "target_month", targetMonth).length;

  const selection = getMonthlySelection(memberId, targetMonth);

  //<== シート読み込み


  const member = members.find(m => m["member_id"] === memberId);
  if (!member) {
    return { ok: false, message: "会員が見つかりません。" };
  }

  if (!selection) {
    return {
      ok: true,
      memberName: member["氏名"],
      billingGroupId: member["請求グループID"],
      targetMonth,
      status: "未宣言",
      amount: 0,
      message: "今月の会費タイプを選択してください。"
    };
  }

  const memberInvoices = invoices.filter(inv =>
    normalizeMonth(inv["target_month"]) === targetMonth &&
    inv["billing_group_id"] === member["請求グループID"]
  );

  if (memberInvoices.length === 0) {
    return {
      ok: true,
      memberName: member["氏名"],
      targetMonth,
      status: "請求なし",
      amount: 0,
      message: "「※今月の請求はまだ作成されていません。」"
    };
  }

  const total = memberInvoices.reduce((sum, inv) => sum + Number(inv["金額"] || 0), 0);

  const fee = fees.find(f =>
    String(f["区分"]).trim() === String(member["区分"]).trim() &&
    String(f["会費タイプ"]).trim() === String(selection["会費タイプ"]).trim()
  );

  const monthlyCap = fee ? Number(fee["月額上限"] || 0) : 0;
  const capped = monthlyCap > 0 && total >= monthlyCap;

  const billedTotal = memberInvoices.reduce((sum, inv) => sum + Number(inv["金額"] || 0), 0);
  const paidTotal = getPaidTotal(payments, targetMonth, member["請求グループID"]);
  const unpaidAmount = Math.max(billedTotal - paidTotal, 0);

  const paid = unpaidAmount === 0 && billedTotal > 0;

  const today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );

  const alreadyAttendedToday =
    attendances.some(a => {

      const attendanceDate =
        Utilities.formatDate(
          new Date(a["日時"]),
          Session.getScriptTimeZone(),
          "yyyy-MM-dd"
        );

      return (
        String(a["member_id"]).trim() ===
          String(memberId).trim()

        &&

        attendanceDate === today
      );
    });

  return {
    ok: true,
    memberName: member["氏名"],
    billingGroupId: member["請求グループID"],
    targetMonth,
    planType: selection["会費タイプ"],
    status: paid ? "支払済" : "未払い",
    cashRequestsLen,
    cashPayCount,
    todayAttendanceRegistered: alreadyAttendedToday,
    billedTotal,
    paidTotal,
    unpaidAmount,
    monthlyCap,
    lessonCount,
    isCapped: monthlyCap > 0 && billedTotal >= monthlyCap,
    message: paid
      ? "今月分は支払い済みです。"
      : "未払いがあります。"
  };
}

// ==============================
// 会費状態取得
// ==============================
function getPaymentStatus(memberId) {
  const t0 = Date.now();
  
  perfLog("START getPaymentStatus", t0);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName("01_会員マスタ");
  const feeSheet = ss.getSheetByName("03_料金マスタ");
  const invoiceSheet = ss.getSheetByName("05_請求明細");
  const paymentSheet = ss.getSheetByName("06_入金ログ");
  const attendanceSheet = ss.getSheetByName("07_出席ログ");
  const cashRequestsSheet = ss.getSheetByName("09_現金支払い要求");

  const members = readSheet(memberSheet);
  const fees = readSheet(feeSheet);
  let invoices = readSheet(invoiceSheet);
  const payments = readSheet(paymentSheet);
  const attendances = readSheet(attendanceSheet);
  const cashRequests = readSheet(cashRequestsSheet);

  const cashRequestsByMemberId = filterBySheet(memberId, cashRequests, "状態", "要求中");
  const cashRequestsLen = cashRequestsByMemberId.length;
  const targetMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");

  const cashPayCount = filterBySheetByDate(memberId, cashRequests, "target_month", targetMonth).length;
  const lessonCount = filterBySheetByDate(memberId, attendances, "target_month", targetMonth).length;

  const selection = getMonthlySelection(memberId, targetMonth);
  const member = members.find(m => m["member_id"] === memberId);
  if (!member) {
    return { ok: false, message: "会員が見つかりません。" };
  }

  if (!selection) {
    return {
      ok: true,
      memberName: member["氏名"],
      billingGroupId: member["請求グループID"],
      targetMonth,
      status: "未宣言",
      amount: 0,
      message: "今月の会費タイプを選択してください。"
    };
  }

  // ここでは書き込まない
  // if (selection["会費タイプ"] === "回数料金") {
  //   updatePerVisitInvoice(members, fees, payments, attendances, memberId, targetMonth);

  //   // 回数料金の請求明細更新後に再読込
  //   invoices = readSheet(invoiceSheet);
  // }

  const memberInvoices = invoices.filter(inv =>
    normalizeMonth(inv["target_month"]) === targetMonth &&
    inv["billing_group_id"] === member["請求グループID"]
  );

  if (memberInvoices.length === 0) {
    return {
      ok: true,
      memberName: member["氏名"],
      targetMonth,
      status: "請求なし",
      amount: 0,
      message: "「※今月の請求はまだ作成されていません。」"
    };
  }

  const total = memberInvoices.reduce((sum, inv) => sum + Number(inv["金額"] || 0), 0);

  const fee = fees.find(f =>
    String(f["区分"]).trim() === String(member["区分"]).trim() &&
    String(f["会費タイプ"]).trim() === String(selection["会費タイプ"]).trim()
  );

  const monthlyCap = fee ? Number(fee["月額上限"] || 0) : 0;
  const capped = monthlyCap > 0 && total >= monthlyCap;

  const billedTotal = memberInvoices.reduce((sum, inv) => sum + Number(inv["金額"] || 0), 0);
  const paidTotal = getPaidTotal(payments, targetMonth, member["請求グループID"]);
  const unpaidAmount = Math.max(billedTotal - paidTotal, 0);

  const paid = unpaidAmount === 0 && billedTotal > 0;

  const today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );

  const alreadyAttendedToday =
    attendances.some(a => {

      const attendanceDate =
        Utilities.formatDate(
          new Date(a["日時"]),
          Session.getScriptTimeZone(),
          "yyyy-MM-dd"
        );

      return (
        String(a["member_id"]).trim() ===
          String(memberId).trim()

        &&

        attendanceDate === today
      );
    });

  return {
    ok: true,
    memberName: member["氏名"],
    billingGroupId: member["請求グループID"],
    targetMonth,
    planType: selection["会費タイプ"],
    status: paid ? "支払済" : "未払い",
    cashRequestsLen,
    cashPayCount,
    todayAttendanceRegistered: alreadyAttendedToday,
    billedTotal,
    paidTotal,
    unpaidAmount,
    monthlyCap,
    lessonCount,
    isCapped: monthlyCap > 0 && billedTotal >= monthlyCap,
    message: paid
      ? "今月分は支払い済みです。"
      : "未払いがあります。"
  };
}

function buildInvoiceViewUpdateValues(invoice) {
  return {
    "請求額": Number(invoice.amount || 0),
    "未払い額": Number(invoice.amount || 0),
    "is_paid": Number(invoice.amount || 0) === 0,
    "支払状態": Number(invoice.amount || 0) === 0 ? "免除" : "未払い",
    "メッセージ": invoice.message || "",
    "更新日時": new Date()
  };
}

