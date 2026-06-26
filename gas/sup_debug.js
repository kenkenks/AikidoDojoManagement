//
// sup_debug.gs
//


//デバック実行用
function debug_run() {
  memberId = "M002"
  plan_id = "P001"

  const ctx = createSheetContext();
  
  result = getMemberPaymentInfo_(memberId, plan_id);
  
  functionName = "debug_run";
  sup_logDebug(functionName, { 
    memberId: memberId, plan_id: plan_id, 
    result: JSON.stringify(result, null, 2)
  });
  
  return { ok: true, message: "処理終了" };
}

// 支払い状況ビュー更新
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
  });
  
  return { ok: true, message: "処理終了" };
}

// 請求系
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

  functionName = "debug_billing_acceptMonthlySelections";
  sup_logDebug(functionName, { 
    samples: samples, 
    result: JSON.stringify(result, null, 2)
  });

  return { ok: true, message: "処理終了" };
}

// 請求系
function debug_billing_acceptMonthlySelection() {
  memberId = "M002"
  plan_id = "P001"

  const result = billing_acceptMonthlySelection(memberId, plan_id);

  functionName = "debug_billing_acceptMonthlySelection";
  sup_logDebug(functionName, { 
    memberId: memberId, plan_id: plan_id, 
    result: JSON.stringify(result, null, 2)
  });
  
  return { ok: true, message: "処理終了" };
}

// 支払い系
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
  });
  
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
  });
  
  return { ok: true, message: "処理終了" };
}

// 現金受領承認
function debug_approveCashRequest() {
  request_id = "CASH-d720ad35"
  const result = approveCashRequest(request_id);
 
  functionName = "debug_approveCashRequest";
  sup_logDebug(functionName, { 
    request_id: request_id, 
    result: JSON.stringify(result, null, 2)
  });
}

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
  functionName = "debug_filterBySheet";
  sup_logDebug(functionName, { 
    memberId: memberId, sheetName: sheetName, boolCol: boolCol, boolValue: boolValue,
    result: JSON.stringify(result, null, 2)
  });
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
