//
// sup_debug.gs
//


//デバック実行用
function debug_run() {
  memberId = "M001"
  plan_id = "P001"

  const ctx = createSheetContext();
  
  result = getMemberPaymentInfo_(memberId, plan_id);
  
  functionName = "debug_run";
  sup_logDebug(functionName, { 
    memberId: memberId, plan_id: plan_id, 
    result: JSON.stringify(result, null, 2)
  }, ctx);
  
  return { ok: true, message: "処理終了" };
}

//
// ================================
// 支払い状況ビュー更新
// ================================
//
function debug_paymentStatusView_refresh() {
  memberId = "M002"
  planType = "回数料金"
  targetMonth = "2026-05";

  const ctx = createSheetContext();
  
  result = paymentStatusView_refresh(memberId, targetMonth, ctx);

  functionName = "debug_paymentStatusView_refresh";
  sup_logDebug(functionName, { 
    memberId: memberId, planType: planType, targetMonth: targetMonth,
    result: JSON.stringify(result, null, 2)
  }, ctx);
  
  return { ok: true, message: "処理終了" };
}


//
// ================================
// 支払い系
// ================================
//
function debug_payment_accept() {
  memberId = "M002"
  paymentMethod = "現金"
  paymentEvidenceId = "XXXXXX-2026-05"  
  targetMonth = "2026-05";

  const ctx = createSheetContext();

  result =  payment_accept(memberId, paymentMethod, paymentEvidenceId, ctx);
 
  functionName = "debug_payment_accept";
  sup_logDebug(functionName, { 
    memberId: memberId,  
    result: JSON.stringify(result, null, 2)
  }, ctx);
  
  return { ok: true, message: "処理終了" };
}

// 支払い情報取得
function debug_getPaymentStatus() {
  memberId = "M002"
  const result = getPaymentStatus(memberId);

  functionName = "debug_getPaymentStatus";
  sup_logDebug(functionName, { 
    memberId: memberId, 
    result: JSON.stringify(result, null, 2)
  }, ctx);
  
  return { ok: true, message: "処理終了" };
}


//===================================================================
// Cotroller系 請求作成＋会費情報取得
function debug_getMemberPaymentInfo() {
  memberId = "M002"
  plan_id = "P001"

  const ctx = createSheetContext();
  
  result = getMemberPaymentInfo_(memberId, plan_id);
  
  functionName = "getMemberPaymentInfo_run";
  sup_logDebug(functionName, { 
    memberId: memberId, plan_id: plan_id, 
    result: JSON.stringify(result, null, 2)
  }, ctx);
  
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
  functionName = "debug_filterBySheet";
  sup_logDebug(functionName, { 
    memberId: memberId, sheetName: sheetName, boolCol: boolCol, boolValue: boolValue,
    result: JSON.stringify(result, null, 2)
  }, ss);
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
