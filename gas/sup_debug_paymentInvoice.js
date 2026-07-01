//
// ================================
// 請求系
// ================================
//
function debug_billing_acceptMonthlySelections() {
  const ctx = createSheetContext();

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
        result = billing_acceptMonthlySelection(sample.memberId, sample.plan_id, ctx);
        Logger.log(JSON.stringify(result, null, 2));
      } catch (e) {
        Logger.log("Error occurred: " + e.toString());
      }
    }

  functionName = "debug_billing_acceptMonthlySelections";
  sup_logDebug(functionName, { 
    samples: samples, 
    result: JSON.stringify(result, null, 2)
  }, ctx);

  return { ok: true, message: "処理終了" };
}

// 請求系
function debug_billing_acceptMonthlySelection() {
  const ctx = createSheetContext();

  memberId = "M002"
  plan_id = "P001"

  const result = billing_acceptMonthlySelection(memberId, plan_id, ctx);

  functionName = "debug_billing_acceptMonthlySelection";
  sup_logDebug(functionName, { 
    memberId: memberId, plan_id: plan_id, 
    result: JSON.stringify(result, null, 2)
  }, ctx);
  
  return { ok: true, message: "処理終了" };
}
