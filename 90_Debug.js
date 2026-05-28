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
  planType = "回数料金"
  targetMonth = "2026-05";

  const ctx = createSheetContext();
  
  vctx = loadPaymentStatusContext(memberId, targetMonth, ctx);
  ret = buildPaymentStatusViewRow(memberId, targetMonth, vctx);
  result = updateFeeStatusView(memberId, targetMonth, ret);
  
  Logger.log(JSON.stringify(result, null, 2));
  
  return { ok: true, message: "処理終了" };
}

function debug_declareMonthlyPlan() {
  memberId = "M002"
  planType = "回数料金"
  const result = declareMonthlyPlan(memberId, planType);
  Logger.log(JSON.stringify(result, null, 2));
  
  return { ok: true, message: "処理終了" };
}

function debug_registerAttendance() {
  memberId = "M003"
  const result = registerAttendance(memberId);
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
  updateFeeStatusView(memberId, targetMonth, {
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
