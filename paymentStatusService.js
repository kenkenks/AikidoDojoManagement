// ==============================
// 会費状態収集
// ==============================

// Viewに書き込むkey value
function buildPaymentStatusViewRow(memberId, targetMonth, ctx) {
  ctx = ctx || loadPaymentStatusContext();

  return {
    target_month: targetMonth,
    member_id: memberId,
    billing_group_id: ctx.billingGroupId,
    会員名: ctx.memberName,
    会費タイプ: ctx.planType,
    請求額: ctx.billedTotal,
    入金額: ctx.paidTotal,
    未払い額: ctx.unpaidAmount,
    is_paid: ctx.isPaid,
    支払状態: ctx.status,
    月額上限: ctx.monthlyCap,
    出席回数: ctx.lessonCount,
    is_capped: ctx.isCapped,
    本日出席済み: ctx.todayAttendanceRegistered,
    現金支払要求未完了数: ctx.cashRequestsLen,
    メッセージ: ctx.message,
    更新日時: new Date()
  };
}

 // Viewに書き込む情報収集
 function collectPaymentStatusContext(memberId, targetMonth, ctx) {
  const t0 = Date.now();
  
  perfLog("START getPaymentStatus", t0);

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const members = getMembers(ctx);
  const fees = getFees(ctx);
  let invoices = getInvoices(ctx);
  const payments = getPayments(ctx);
  const attendances = getAttendances(ctx);
  const cashRequests = getCashRequests(ctx);

  const member = members.find(m => m["member_id"] === memberId);
  if (!member) {
    return { ok: false, message: "会員が見つかりません。" };
  }

  // return values
  const memberName = member["氏名"];
  const billingGroupId = member["請求グループID"];
  //const targetMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  const cashPayCount = filterBySheetByDate(memberId, cashRequests, "target_month", targetMonth).length;
  const lessonCount = filterBySheetByDate(memberId, attendances, "target_month", targetMonth).length;
  const paidTotal = getPaidTotal(payments, targetMonth, member["請求グループID"]);

  const cashRequestsByMemberId = filterBySheet(memberId, cashRequests, "状態", "要求中");
  const cashRequestsLen = cashRequestsByMemberId.length;

  // return values を変数へ
  let status = "未宣言";
  let amount = 0
  let message = "今月の会費タイプを選択してください。"
  const selection = getMonthlySelection(memberId, targetMonth, ctx);
  if (!selection) {
    return {
      ok: true,
      memberName: memberName,
      billingGroupId: billingGroupId,
      targetMonth,
      status: status,
      amount: amount,
      message: message
    };
  }
  const planType = selection["会費タイプ"];

  const fee = fees.find(f =>
    String(f["区分"]).trim() === String(member["区分"]).trim() &&
    String(f["会費タイプ"]).trim() === String(planType).trim()
  );
  const monthlyCap = fee ? Number(fee["月額上限"] || 0) : 0;

  status = "請求なし";
  amount = 0
  message = "「※今月の請求はまだ作成されていません。」";
  const memberInvoices = invoices.filter(inv =>
    normalizeMonth(inv["target_month"]) === targetMonth &&
    inv["billing_group_id"] === billingGroupId
  );
  if (memberInvoices.length === 0) {
    return {
      ok: true,
      memberName: memberName,
      targetMonth,
      status: status,
      amount: 0,
      message: message
    };
  }

  const billedTotal = memberInvoices.reduce((sum, inv) => sum + Number(inv["金額"] || 0), 0);
  const total = memberInvoices.reduce((sum, inv) => sum + Number(inv["金額"] || 0), 0);
  const unpaidAmount = Math.max(billedTotal - paidTotal, 0);
  const paid = unpaidAmount === 0 && billedTotal > 0;
  const capped = monthlyCap > 0 && total >= monthlyCap;

  // return values
  // ==>

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
  // <==

  // return values
  status = paid ? "支払済" : "未払い";
  message = paid ? 
      "今月分は支払い済みです。":
      "未払いがあります。";

  // return 本丸  
  return {
    ok: true,
    memberName: memberName,
    billingGroupId: billingGroupId,
    targetMonth,
    planType: planType,
    status: status,
    cashRequestsLen,
    cashPayCount,
    todayAttendanceRegistered: alreadyAttendedToday,
    billedTotal,
    paidTotal,
    unpaidAmount,
    monthlyCap,
    lessonCount,
    isCapped: monthlyCap > 0 && billedTotal >= monthlyCap,
    message: message
  };
}

// ==============================
// 会費状態取得
// ==============================
function getPaymentStatus(memberId) {
  try {
    if (!memberId) {
      return {
        ok: false,
        message: "memberId が指定されていません。"
      };
    }

    const ctx = createSheetContext();

    const targetMonth = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

    const rows = getFeeStatusViewRows(ctx);

    let row = rows.find(r =>
      normalizeMonth(r["target_month"]) === targetMonth &&
      String(r["member_id"]).trim() === String(memberId).trim()
    );

    if (!row) {
      const vctx = collectPaymentStatusContext(memberId, targetMonth, ctx);
      row = buildPaymentStatusViewRow(memberId, targetMonth, vctx);

      updateFeeStatusView(memberId, targetMonth, row);
      invalidateFeeStatusView(ctx);
    }

    if (!row) {
      return {
        ok: false,
        message: "会費状態を作成できませんでした。"
      };
    }

    return convertFeeStatusViewRowToResponse(row);

  } catch (e) {
    return {
      ok: false,
      message: "getPaymentStatus error: " + e.message
    };
  }
}

function convertFeeStatusViewRowToResponse(row) {
  return {
    ok: true,
    memberName: String(row["会員名"] || ""),
    billingGroupId: String(row["billing_group_id"] || ""),
    targetMonth: normalizeMonth(row["target_month"]),
    planType: String(row["会費タイプ"] || ""),
    billedTotal: Number(row["請求額"] || 0),
    paidTotal: Number(row["入金額"] || 0),
    unpaidAmount: Number(row["未払い額"] || 0),
    isPaid: row["is_paid"] === true || row["is_paid"] === "TRUE",
    status: String(row["支払状態"] || ""),
    monthlyCap: Number(row["月額上限"] || 0),
    lessonCount: Number(row["出席回数"] || 0),
    isCapped: row["is_capped"] === true || row["is_capped"] === "TRUE",
    todayAttendanceRegistered:
      row["本日出席済み"] === true || row["本日出席済み"] === "TRUE",
    cashRequestsLen: Number(row["現金支払要求未完了数"] || 0),
    message: String(row["メッセージ"] || "")
  };
}