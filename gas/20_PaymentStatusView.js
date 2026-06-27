// 20_PaymentStatusView.gs
//   会費状態Viewを作る
//   会費状態Viewを更新する
//   会費状態Viewを取得する

// ==============================
// View更新（メイン）
// ==============================
function paymentStatusView_refresh(memberId, targetMonth, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());

  const viewContext =
    paymentStatusView_collectContext(memberId, targetMonth, ctx);

  const row =
    paymentStatusView_buildRow(memberId, targetMonth, viewContext);

  paymentStatusView_update(memberId, targetMonth, row);

  invalidateFeeStatusView(ctx);

  return {
    ok: true,
    row
  };
}

// ==============================
// 情報収集
// ==============================
function paymentStatusView_collectContext(memberId, targetMonth, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());

  const t0 = Date.now();
  perfLog("START paymentStatusView_collectContext", t0);

  const members = getMembers(ctx);
  const fees = getFees(ctx);
  const invoices = getInvoices(ctx);
  const payments = getPayments(ctx);
  const attendances = getAttendances(ctx);
  const cashRequests = getPaymentEvidences(ctx);

  const member = members.find(m =>
    String(m["member_id"]).trim() === String(memberId).trim()
  );

  if (!member) {
    return { ok: false, message: "会員が見つかりません。" };
  }

  const memberName = member["氏名"];
  const billingGroupId = member["請求グループID"];
  const normalizedTargetMonth = normalizeMonth(targetMonth);

  const cashPayCount = filterBySheetByDate(
    memberId,
    cashRequests,
    "target_month",
    normalizedTargetMonth
  ).length;

  const lessonCount =
    calculateAttendanceChargeCount(memberId, normalizedTargetMonth, ctx).charge_count;

  const paidTotal =
    payment_getPaidTotal(payments, normalizedTargetMonth, billingGroupId);

  const cashRequestsLen = filterBySheet(
    memberId,
    cashRequests,
    "状態",
    "要求中"
  ).length;

  const selection = billing_getMonthlySelection(
    billingGroupId,
    normalizedTargetMonth,
    ctx
  );

  if (!selection) {
    return {
      ok: true,
      memberName,
      billingGroupId,
      targetMonth: normalizedTargetMonth,
      planType: "",
      status: "未宣言",
      billedTotal: 0,
      paidTotal,
      unpaidAmount: 0,
      monthlyCap: 0,
      lessonCount,
      isPaid: false,
      isCapped: false,
      todayAttendanceRegistered: paymentStatusView_isAttendedToday(memberId, attendances),
      cashRequestsLen,
      cashPayCount,
      message: "今月の会費タイプを選択してください。"
    };
  }

  const planId = selection["plan_id"];

  const memberInvoices = invoices.filter(inv =>
    normalizeMonth(inv["target_month"]) === normalizedTargetMonth &&
    String(inv["billing_group_id"]).trim() === String(billingGroupId).trim()
  );

  if (memberInvoices.length === 0) {
    return {
      ok: true,
      memberName,
      billingGroupId,
      targetMonth: normalizedTargetMonth,
      planType: planId,
      status: "請求なし",
      billedTotal: 0,
      paidTotal,
      unpaidAmount: 0,
      monthlyCap,
      lessonCount,
      isPaid: false,
      isCapped: false,
      todayAttendanceRegistered: paymentStatusView_isAttendedToday(memberId, attendances),
      cashRequestsLen,
      cashPayCount,
      message: "※今月の請求はまだ作成されていません。"
    };
  }

  const billedTotal = memberInvoices.reduce(
    (sum, inv) => sum + Number(inv["請求予定額"] || inv["金額"] || 0),
    0
  );

  const monthlyCap = memberInvoices.reduce(
    (max, inv) => Math.max(max, Number(inv["上限金額"] || 0)),
    0
  );

  const isCapped = monthlyCap > 0 && billedTotal >= monthlyCap;
  const unpaidAmount = Math.max(billedTotal - paidTotal, 0);
  const paid = unpaidAmount === 0;
  const isPaid = paid && billedTotal > 0;
  const status =
    billedTotal === 0
      ? "免除"
      : paid
        ? "支払済"
        : "未払い";

  const message =
    status === "免除"
      ? "今月分は支払い不要です。"
      : status === "支払済"
        ? "今月分は支払い済みです。"
        : "未払いがあります。";

  return {
    ok: true,
    memberName,
    billingGroupId,
    targetMonth: normalizedTargetMonth,
    planType: planId,
    status,
    billedTotal,
    paidTotal,
    unpaidAmount,
    monthlyCap,
    lessonCount,
    isPaid,
    isCapped,
    todayAttendanceRegistered: paymentStatusView_isAttendedToday(memberId, attendances),
    cashRequestsLen,
    cashPayCount,
    message
  };
}

// ==============================
// View行生成
// ==============================
function paymentStatusView_buildRow(memberId, targetMonth, ctx) {
  ctx = ctx || {};

  return {
    target_month: normalizeMonth(targetMonth),
    member_id: memberId,
    billing_group_id: ctx.billingGroupId || "",
    会員名: ctx.memberName || "",
    会費タイプ: ctx.planType || "",
    請求額: Number(ctx.billedTotal || 0),
    入金額: Number(ctx.paidTotal || 0),
    未払い額: Number(ctx.unpaidAmount || 0),
    is_paid: !!ctx.isPaid,
    支払状態: ctx.status || "",
    月額上限: Number(ctx.monthlyCap || 0),
    出席回数: Number(ctx.lessonCount || 0),
    is_capped: !!ctx.isCapped,
    本日出席済み: !!ctx.todayAttendanceRegistered,
    現金支払要求未完了数: Number(ctx.cashRequestsLen || 0),
    メッセージ: ctx.message || "",
    更新日時: new Date()
  };
}

// ==============================
// View更新
// ==============================
function paymentStatusView_update(memberId, targetMonth, updateValues) {
  upsertViewRow(
    "20_会費状態View",
    ["target_month", "member_id"],
    {
      target_month: normalizeMonth(targetMonth),
      member_id: memberId
    },
    updateValues
  );
}

// ==============================
// View取得
// ==============================
function paymentStatusView_get(memberId) {
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
      const result = paymentStatusView_refresh(memberId, targetMonth, ctx);
      row = result.row;
    }

    if (!row) {
      return {
        ok: false,
        message: "会費状態を作成できませんでした。"
      };
    }

    return paymentStatusView_convertResponse(row);

  } catch (e) {
    return {
      ok: false,
      message: "paymentStatusView_get error: " + e.message
    };
  }
}

function paymentStatusView_convertResponse(row) {
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

// ==============================
// Calc
// ==============================
function paymentStatusView_isAttendedToday(memberId, attendances) {
  const today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );

  return attendances.some(a => {
    if (!isActiveMasterRow_(a) || !a["稽古日"]) return false;

    const attendanceDate = formatAttendanceDate_(a["稽古日"]);

    return (
      String(a["member_id"]).trim() === String(memberId).trim() &&
      attendanceDate === today
    );
  });
}

// ==============================
// 互換ラッパー
// ==============================
function PaymentStatusView_collectContext(memberId, targetMonth, ctx) {
  return paymentStatusView_collectContext(memberId, targetMonth, ctx);
}

function PaymentStatusView_buildViewRow(memberId, targetMonth, ctx) {
  return paymentStatusView_buildRow(memberId, targetMonth, ctx);
}

function PaymentStatusView_update(memberId, targetMonth, updateValues) {
  return paymentStatusView_update(memberId, targetMonth, updateValues);
}

function getPaymentStatus(memberId) {
  return paymentStatusView_get(memberId);
}

function convertFeeStatusViewRowToResponse(row) {
  return paymentStatusView_convertResponse(row);
}
