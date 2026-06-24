// 03_Billing.gs
//   請求を作る
//   請求額を決める

// ==============================
// 会費タイプ宣言
// ==============================
//
// 月初請求生成
//
function declareMonthlyPlan(memberId, plan_id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 更新シート
  const monthlySheet = ss.getSheetByName("04_月次選択");

  const ctx = createSheetContext();

  const members = getMembers(ctx);
  const member = members.find(m => m["member_id"] === memberId);
  const billing_group_id = member["請求グループID"];

  // 該当移動データなし
  if (!member) {
    return { ok: false, message: "会員が見つかりません。" };
  }

  const targetMonth = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");

  const existing = getMonthlySelection(billing_group_id, targetMonth, ctx);
  if (existing) {
    return { ok: false, message: "今月の会費タイプはすでに宣言済みです。" };
  }

  Logger.log("appendMonthlySelection():" + plan_id);

  //DAO的
  appendMonthlySelection(
    ctx,
    targetMonth,
    memberId,
    billing_group_id,
    plan_id
  );

  // 請求明細の書き込み
  createOrUpdateMonthlyInvoice(memberId, targetMonth, plan_id, ctx);

  // Viewに書き込む情報収集
  const vctx = PaymentStatusView_collectContext(memberId, targetMonth, ctx);
  // Viewに書き込むkey value
  const ret = PaymentStatusView_buildViewRow(memberId, targetMonth, vctx);
  // Viewに書き込む
  PaymentStatusView_update(memberId, targetMonth, ret);

  return { ok: true, message: `${targetMonth} の会費タイプを「${plan_id}」で登録しました。` };
}

function createOrUpdateMonthlyInvoice(memberId, targetMonth, plan_id, ctx) {
  Logger.log("createOrUpdateMonthlyInvoice(): Start!!");

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 更新シート
  const invoiceSheet = ss.getSheetByName("05_請求明細");
 
  ctx = ensureSheetContext(ctx);

  const members = getMembers(ctx);
  const fees = getFees(ctx);
  const invoices = getInvoices(ctx);

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

  const normalizedTargetMonth =
    normalizeMonth(targetMonth);

  const billingGroupId =
    member["請求グループID"];

  const memberType =
    member["区分"];


  Logger.log(
    JSON.stringify({
      memberType,
      plan_id
    })
  );

  fees.forEach(f => {
    Logger.log(
      JSON.stringify({
        plan_id: f["plan_id"],
        表示名: f["表示名"]
      })
    );
  });

  const fee = fees.find(f => {

    return (
      String(f["plan_id"]).trim() ===
        String(plan_id).trim()
    );
  });

  const planType = 
    fee["会費タイプ"];

  const planName = 
    fee["表示名"];

  const amount =
    Number(fee["回数単価"] || 0);

  let invoiceType = planType; // 請求種別
  let invoiceName = planName; // 表示名

  Logger.log("既存請求明細の確認=" + planType);

  // 既存請求明細の確認
  const exists = invoices.find(inv => {
    return (
      normalizeMonth(inv["target_month"]) === normalizedTargetMonth &&
      String(inv["billing_group_id"]).trim() === String(billingGroupId).trim()
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

  Logger.log("appendInvoice()=" + invoiceId);

  const status = amount === 0 ? "免除" : "未払い";
  const paidAt = "";
  const createdAt = new Date();
  const note = "";

  //dao的
  appendInvoice(ctx, {
    invoiceId,
    targetMonth,
    billingGroupId,
    memberId,
    plan_id,
    invoiceType,
    invoiceName,
    amount,
    status,
    paidAt,
    createdAt,
    note
  });

  return {
    ok: true,
    message:
      `${normalizedTargetMonth} の請求明細を作成しました。`
  };

}


function getMonthlySelection(billingGroupId, targetMonth, ctx) {

  Logger.log("getMonthlySelection(): Start!!");

  ctx = ensureSheetContext(ctx);

  const members = getMembers(ctx);
  const fees = getFees(ctx);
  const monthlySelections = getMonthlySelections(ctx);
  const invoices = getInvoices(ctx);


  Logger.log("getMonthlySelection(): check ctx!!");

  const normalizedTargetMonth = normalizeMonth(targetMonth);
  const normalizedBillingGroupId = String(billingGroupId).trim();

  return monthlySelections.find(row =>
    normalizeMonth(row["target_month"]) === normalizedTargetMonth &&
    String(row["billing_group_id"]).trim() === normalizedBillingGroupId
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
function updatePerVisitInvoice(memberId, targetMonth, ctx) {
  ctx = ensureSheetContext(ctx);

  const members = getMembers(ctx);
  const fees = getFees(ctx);

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

  // 1時間の出席ログ数ではなく、同日・同課金枠をまとめた課金回数を使う。
  // 例: 2枠までは1回、3枠なら2回。
  const attendanceCharge = calculateAttendanceChargeCount(memberId, target, ctx);
  const count = attendanceCharge.charge_count;

  const unitPrice = Number(fee["回数単価"] || 0);
  const monthlyCap = Number(fee["月額上限"] || 0);

  const amount = monthlyCap > 0
    ? Math.min(count * unitPrice, monthlyCap)
    : count * unitPrice;

  upsertInvoiceAmount(
    ctx,
    memberId,
    billingGroupId,
    target,
    "回数料金",
    fee["表示名"] || `${memberType}回数料金`,
    amount
  );

  updateInvoiceStatusByPayment(
    target,
    billingGroupId,
    ctx
  );

  return {
    ok: true,
    message: `${target} の回数料金を ${amount}円 に更新しました。`,
    amount,
    chargeCount: count,
    chargeDetails: attendanceCharge.details
  };
}

//請求明細を作成/更新する共通関数
function upsertInvoiceAmount(
  ctx,
  memberId,
  billingGroupId,
  targetMonth,
  invoiceType,
  invoiceName,
  amount
) {
  ctx = ensureSheetContext(ctx);

  const invoiceSheet = ctx.ss.getSheetByName("05_請求明細");

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

      invalidateInvoices(ctx);
      return;
    }
  }

  const invoiceId = "INV-" + Utilities.getUuid().slice(0, 8);
  const status = amount === 0 ? "免除" : "未払い";
  const paidAt = "";
  const createdAt = new Date();
  const note = "";

  //dao的
  appendInvoice(ctx, {
    invoiceId,
    targetMonth,
    billingGroupId,
    memberId,
    plan_id,
    invoiceType,
    invoiceName,
    amount,
    status,
    paidAt,
    createdAt,
    note
  });

}


// ==============================
// DAO 系処理
// ==============================

function appendMonthlySelection(ctx, targetMonth, memberId, billingGroupId, plan_id) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("04_月次選択");

  sheet.appendRow([
    targetMonth,
    memberId,
    billingGroupId,
    plan_id,
    new Date(),
    "有効",
    ""
  ]);

  invalidateMonthlySelections(ctx);
}


function appendInvoice(ctx, invoice) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("05_請求明細");

  sheet.appendRow([
    invoice.invoiceId,
    invoice.targetMonth,
    invoice.billingGroupId,
    invoice.memberId,
    invoice.plan_id,
    invoice.invoiceType,
    invoice.invoiceName,
    invoice.amount,
    invoice.status,
    invoice.paidAt || "",
    invoice.createdAt || new Date(),
    invoice.note || ""
  ]);

  invalidateInvoices(ctx);
}
