// 03_Billing.gs
//   請求を作る
//   請求額を決める

// ==============================
// 会費タイプ宣言
// ==============================
//
// 月初請求生成
//
function declareMonthlyPlan(memberId, planType) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName("01_会員マスタ");
  const monthlySheet = ss.getSheetByName("04_月次選択");

  const members = readSheet(memberSheet);
  const member = members.find(m => m["member_id"] === memberId);

  if (!member) {
    return { ok: false, message: "会員が見つかりません。" };
  }

  const targetMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");

  const existing = getMonthlySelection(memberId, targetMonth);
  if (existing) {
    return { ok: false, message: "今月の会費タイプはすでに宣言済みです。" };
  }

  Logger.log("22:planType=" + planType);

  monthlySheet.appendRow([
    targetMonth,
    memberId,
    member["請求グループID"],
    planType,
    new Date(),
    "有効",
    ""
  ]);

  if (planType === "月会費") {
    createOrUpdateMonthlyInvoice(memberId, targetMonth, planType);
  }

  if(0) {
    if (planType === "回数料金") {
      createOrUpdateMonthlyInvoice(memberId, targetMonth, planType);
    }
  }

  if (planType === "休会") {
    createOrUpdateMonthlyInvoice(memberId, targetMonth, planType);
  }

  return { ok: true, message: `${targetMonth} の会費タイプを「${planType}」で登録しました。` };
}

function createOrUpdateMonthlyInvoice(memberId, targetMonth, planType) {

  Logger.log("48:planType=" + planType);

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const memberSheet =
    ss.getSheetByName("01_会員マスタ");

  const feeSheet =
    ss.getSheetByName("03_料金マスタ");

  const invoiceSheet =
    ss.getSheetByName("05_請求明細");

  const members = readSheet(memberSheet);
  const fees = readSheet(feeSheet);

  const member = members.find(m =>
    String(m["member_id"]).trim() ===
    String(memberId).trim()
  );

  if (!member) {
    return {
      ok: false,
      message: "会員が見つかりません。"
    };
  }

  Logger.log("76:planType=" + planType);

  const normalizedTargetMonth =
    normalizeMonth(targetMonth);

  const billingGroupId =
    member["請求グループID"];

  const memberType =
    member["区分"];


  Logger.log(
    JSON.stringify({
      memberType,
      planType
    })
  );

  fees.forEach(f => {
    Logger.log(
      JSON.stringify({
        区分: f["区分"],
        会費タイプ: f["会費タイプ"]
      })
    );
  });

  const fee = fees.find(f => {

    return (
      String(f["区分"]).trim() ===
        String(memberType).trim() &&

      String(f["会費タイプ"]).trim() ===
        String(planType).trim()
    );
  });

  if (!fee && planType !== "休会") {

    return {
      ok: false,
      message:
        `料金マスタ未登録: 区分=${memberType} 会費タイプ=${planType}`
    };
  }

  Logger.log("105:planType=" + planType);
 
  let amount = 0;

  let invoiceType = planType;
  let invoiceName = planType;

  // 月会費
  if (planType === "月会費") {

    amount =
      Number(fee["回数単価"] || 0);

    invoiceType = "月会費";

    invoiceName =
      fee["表示名"] ||
      `${memberType}月会費`;
  }

  // 回数料金
  else if (planType === "回数料金") {

    amount =
      Number(fee["回数単価"] || 0);

    invoiceType = "回数料金";

    invoiceName =
      fee["表示名"] ||
      `${memberType}回数料金`;
  }

  // 休会
  else if (planType === "休会") {

    amount = 0;

    invoiceType = "休会";

    invoiceName = "休会";
  }
  Logger.log("151:planType=" + planType);

  // 既存請求確認
  const invoices =
    readSheet(invoiceSheet);

  const exists = invoices.find(inv => {

    return (
      normalizeMonth(inv["target_month"]) ===
        normalizedTargetMonth &&

      String(inv["member_id"]).trim() ===
        String(memberId).trim()
    );
  });

  // 既存あり
  if (exists) {

    return {
      ok: true,
      message: "請求明細は既に存在します。"
    };
  }

  // 新規請求作成
  const invoiceId =
    "INV-" +
    Utilities.getUuid().slice(0, 8);

  Logger.log("187:planType=" + planType);

  invoiceSheet.appendRow([
    invoiceId,
    normalizedTargetMonth,
    billingGroupId,
    memberId,
    invoiceType,
    invoiceName,
    amount,
    amount === 0 ? "免除" : "未払い",
    "",
    new Date(),
    ""
  ]);

  if (planType === "月会費") {
    return {
      ok: true,
      message:
        `${normalizedTargetMonth} の請求明細を作成しました。`
    };
  }
  else if (planType === "回数料金") {
    return {
      ok: true,
      message: "回数料金は宣言のみ登録しました。出席時に請求を作成します。"
    };
  }

}


function getMonthlySelection(memberId, targetMonth) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("04_月次選択");
  const rows = readSheet(sheet);

  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedMemberId = String(memberId).trim();

  return rows.find(row =>
    normalizeMonth(row["target_month"]) === normalizedTargetMonth &&
    String(row["member_id"]).trim() === normalizedMemberId
  ) || null;
}

// ==============================
// 請求生成
// ==============================
//
//
// 月次請求生成（引き落としをするなら使用する）
//
function generateInvoices() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const memberSheet = ss.getSheetByName("01_会員マスタ");
  const groupSheet = ss.getSheetByName("02_請求グループ");
  const feeSheet = ss.getSheetByName("03_料金マスタ");
  const monthlySheet = ss.getSheetByName("04_月次選択");
  const invoiceSheet = ss.getSheetByName("05_請求明細");

  const members = readSheet(memberSheet);
  const groups = readSheet(groupSheet);
  const fees = readSheet(feeSheet);
  const monthlySelections = readSheet(monthlySheet);
  // 二重生成チェック
  const existingInvoices = readSheet(invoiceSheet);

  const targetMonth = Browser.inputBox("請求対象月を入力してください", "例：2026-05", Browser.Buttons.OK_CANCEL);
  if (targetMonth === "cancel" || !targetMonth) return;

  const normalizedTargetMonth = normalizeMonth(targetMonth);

  const alreadyExists = existingInvoices.some(row => {
    return normalizeMonth(row["target_month"]) === normalizedTargetMonth;
  });

  if (alreadyExists) {
    Browser.msgBox(
      `${normalizedTargetMonth} の請求はすでに存在します。\n二重生成を防ぐため処理を中止します。`
    );
    return;
  }

  const feeMap = {};
  fees.forEach(row => {
    feeMap[row["区分"]] = {
      perVisit: Number(row["回数料金"] || 0),
      monthly: Number(row["月額費"] || 0)
    };
  });

  const groupMap = {};
  groups.forEach(row => {
    groupMap[row["billing_group_id"]] = row;
  });

  const selections = monthlySelections.filter(row => {
    return normalizeMonth(row["target_month"]) === normalizedTargetMonth;
  });

  if (selections.length === 0) {
    Browser.msgBox("対象月の月次選択データがありません。");
    return;
  }

  const invoices = [];

  const familyGroups = {};

  selections.forEach(sel => {
    const member = members.find(m => m["member_id"] === sel["member_id"]);
    if (!member) return;

    if (member["状態"] === "退会") return;

    const billingGroupId = sel["billing_group_id"];
    const fee = feeMap[member["区分"]];
    if (!fee) return;

    const billingType = sel["課金タイプ"];
    const count = Number(sel["回数"] || 0);

    const group = groupMap[billingGroupId];
    const isFamily = group && group["家族割対象"] === "あり";

    if (billingType === "休会") {
      invoices.push(makeInvoice(normalizedTargetMonth, billingGroupId, member["member_id"], "月額費", "休会", 0));
      return;
    }

    if (isFamily && billingType === "月額費") {
      if (!familyGroups[billingGroupId]) {
        familyGroups[billingGroupId] = [];
      }
      familyGroups[billingGroupId].push(member);
      return;
    }

    if (billingType === "月額費") {
      invoices.push(makeInvoice(targetMonth, billingGroupId, member["member_id"], "月額費", `${member["区分"]}月額費`, fee.monthly));
      return;
    }

    if (billingType === "回数") {
      invoices.push(makeInvoice(normalizedTargetMonth, billingGroupId, member["member_id"], "回数料金", `${member["区分"]} ${count}回`, fee.perVisit * count));
      return;
    }

    if (billingType === "ビジター") {
      invoices.push(makeInvoice(normalizedTargetMonth, billingGroupId, member["member_id"], "ビジター", `ビジター ${count}回`, fee.perVisit * count));
      return;
    }
  });

  Object.keys(familyGroups).forEach(groupId => {
    const familyMembers = familyGroups[groupId];
    const count = familyMembers.length;

    if (count >= 2) {
      const amount = 9000 + (count - 2) * 2000;
      invoices.push(makeInvoice(normalizedTargetMonth, groupId, "", "家族月額費", `家族月額費 ${count}人`, amount));
    } else if (count === 1) {
      const member = familyMembers[0];
      const fee = feeMap[member["区分"]];
      invoices.push(makeInvoice(normalizedTargetMonth, groupId, member["member_id"], "月額費", `${member["区分"]}月額費`, fee.monthly));
    }
  });

  if (invoices.length === 0) {
    Browser.msgBox("作成対象の請求がありません。");
    return;
  }

  writeInvoices(invoiceSheet, invoices);
  Browser.msgBox(`${normalizedTargetMonth} の請求明細を ${invoices.length} 件作成しました。`);
}


function makeInvoice(targetMonth, billingGroupId, memberId, type, name, amount) {
  const now = new Date();
  const invoiceId = `INV-${targetMonth}-${billingGroupId}-${memberId || "GROUP"}-${Utilities.getUuid().slice(0, 8)}`;

  return {
    invoice_id: invoiceId,
    target_month: targetMonth,
    billing_group_id: billingGroupId,
    member_id: memberId,
    請求種別: type,
    表示名: name,
    金額: amount,
    支払状態: amount === 0 ? "免除" : "未払い",
    支払期限: "",
    作成日: now,
    備考: ""
  };
}

function writeInvoices(sheet, invoices) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const rows = invoices.map(inv => {
    return headers.map(header => inv[header] ?? "");
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

// ==============================
// 回数料金
// ==============================
//回数料金用：請求額を増やす関数
function updatePerVisitInvoice(members, fees, payments, attendances, memberId, targetMonth) {

  const member = members.find(m =>
    String(m["member_id"]).trim() === String(memberId).trim()
  );

  if (!member) {
    return { ok: false, message: "会員が見つかりません。" };
  }

  const target = normalizeMonth(targetMonth);
  const billingGroupId = member["請求グループID"];
  const memberType = member["区分"];

  const fee = fees.find(f =>
    String(f["区分"]).trim() === String(memberType).trim() &&
    String(f["会費タイプ"]).trim() === "回数料金"
  );

  if (!fee) {
    return { ok: false, message: "料金マスタに回数料金がありません。" };
  }

  const count = attendances.filter(a =>
    normalizeMonth(a["target_month"]) === target &&
    String(a["member_id"]).trim() === String(memberId).trim()
  ).length;

  const unitPrice = Number(fee["回数単価"] || 0);
  const monthlyCap = Number(fee["月額上限"] || 0);

  const amount = monthlyCap > 0
    ? Math.min(count * unitPrice, monthlyCap)
    : count * unitPrice;

  upsertInvoiceAmount(
    memberId,
    billingGroupId,
    target,
    "回数料金",
    fee["表示名"] || `${memberType}回数料金`,
    amount
  );

  updateInvoiceStatusByPayment(payments, target, billingGroupId);

  return {
    ok: true,
    message: `${target} の回数料金を ${amount}円 に更新しました。`,
    amount
  };
}

//請求明細を作成/更新する共通関数
function upsertInvoiceAmount(memberId, billingGroupId, targetMonth, invoiceType, invoiceName, amount) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invoiceSheet = ss.getSheetByName("05_請求明細");

  const values = invoiceSheet.getDataRange().getValues();
  const headers = values[0];

  const col = {};
  headers.forEach((h, i) => col[h] = i);

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    if (
      normalizeMonth(row[col["target_month"]]) === normalizeMonth(targetMonth) &&
      String(row[col["member_id"]]).trim() === String(memberId).trim()
    ) {
      invoiceSheet.getRange(r + 1, col["請求種別"] + 1).setValue(invoiceType);
      invoiceSheet.getRange(r + 1, col["表示名"] + 1).setValue(invoiceName);
      invoiceSheet.getRange(r + 1, col["金額"] + 1).setValue(amount);
      return;
    }
  }

  const invoiceId = "INV-" + Utilities.getUuid().slice(0, 8);

  invoiceSheet.appendRow([
    invoiceId,
    normalizeMonth(targetMonth),
    billingGroupId,
    memberId,
    invoiceType,
    invoiceName,
    amount,
    amount === 0 ? "免除" : "未払い",
    "",
    new Date(),
    ""
  ]);
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

  if (selection["会費タイプ"] === "回数料金") {
    updatePerVisitInvoice(members, fees, payments, attendances, memberId, targetMonth);

    // 回数料金の請求明細更新後に再読込
    invoices = readSheet(invoiceSheet);
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

