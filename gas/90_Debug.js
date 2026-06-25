//
// debug.gs
//

const DEBUG_PERF = true;

function perfLog(label, t0) {

  if (!DEBUG_PERF) return;

  Logger.log(
    `[PERF] ${label} ms=${Date.now() - t0}`
  );
}

//デバック実行用
function debug_run() {
  memberId = "M002"

  const ctx = createSheetContext();
  
  result = getMemberInfoForPayment(memberId);
  
  Logger.log(JSON.stringify(result, null, 2));
  
  return { ok: true, message: "処理終了" };
}

//使用
function debug_paymentStatusView_refresh() {
  memberId = "M002"
  planType = "回数料金"
  targetMonth = "2026-05";

  const ctx = createSheetContext();
  
  result = paymentStatusView_refresh(memberId, targetMonth, ctx);
  
  Logger.log(JSON.stringify(result, null, 2));
  
  return { ok: true, message: "処理終了" };
}

//使用
function debug_billing_acceptMonthlySelections() {
  samples = [
    { memberId: "M001", plan_id: "P001" },
    { memberId: "M002", plan_id: "P002" },
    { memberId: "M003", plan_id: "P007" },
    { memberId: "M004", plan_id: "P011" },
    { memberId: "M005", plan_id: "P012" },
    { memberId: "M006", plan_id: "P013" },
    { memberId: "M007", plan_id: "P020" },
    { memberId: "M008", plan_id: "P021" }
  ];

    let result = null;
    for (const sample of samples) {
      try {
        result = billing_acceptMonthlySelection(sample.memberId, sample.plan_id);
        Logger.log(JSON.stringify(result, null, 2));
      } catch (e) {
        Logger.log("Error occurred: " + e.toString());
      }
    }

  Logger.log(JSON.stringify(result, null, 2));
  
  return { ok: true, message: "処理終了" };
}

//使用
function debug_billing_acceptMonthlySelection() {
  memberId = "M002"
  plan_id = "P001"

  const result = billing_acceptMonthlySelection(memberId, plan_id);
  Logger.log(JSON.stringify(result, null, 2));
  
  return { ok: true, message: "処理終了" };
}

function debug_payment_accept() {
  memberId = "M002"
  paymentMethod = "現金"
  paymentEvidenceId = "XXXXXX-2026-05"  
  targetMonth = "2026-05";

  const ctx = createSheetContext();

  result =  payment_accept(memberId, paymentMethod, paymentEvidenceId, ctx);
 
  Logger.log(JSON.stringify(result, null, 2));
  
  return { ok: true, message: "処理終了" };
}


//デバック実行用
function debug_getPaymentStatus() {
  memberId = "M002"
  const result = getPaymentStatus(memberId);
  Logger.log(JSON.stringify(result, null, 2));
  
  return { ok: true, message: "処理終了" };
}

function debug_approveCashRequest() {
  request_id = "CASH-d720ad35"
  const result = approveCashRequest(request_id);
  Logger.log(JSON.stringify(result, null, 2));
}

function debug_updateFeeStatusView() {
  memberId = "M002"
  targetMonth = "2026-12"
  planType = "回数料金"
  PaymentStatusView_update(memberId, targetMonth, {
    "会費タイプ": planType,
    "更新日時": new Date()
  });
  
  return { ok: true, message: "処理終了" };
}

// 共通系
function debug_filterBySheet() {
  memberId = "M002"
  sheetName = "07_出席ログ"
  boolCol = "target_month"
  boolValue = "2026-05"

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  const rows = readSheet(sheet);

  const result = filterBySheet(memberId, rows, boolCol, boolValue);
  Logger.log(JSON.stringify(result, null, 2));
}


//
// ================================
// 設定機能
// ================================
//

// URL生成処理
function getSetting(key) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName("99_設定");

  if (!sheet) {
    throw new Error("99_設定 シートがありません");
  }

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {

    const row = values[i];

    if (row[0] === key) {
      return row[1];
    }
  }

  throw new Error(`設定が見つかりません: ${key}`);
}
