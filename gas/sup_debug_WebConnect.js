// ================================
// Code.js デバッグランナー
// ================================

function debug_code_doGet_attendanceSessionInfo() {
  const e = {
    parameter: {
      action: "attendance_session_info",
      location_id: "HONBU",
      billing_block_id: ""
    }
  };

  const result = doGet(e);

  Logger.log(result.getContent());

  return result.getContent();
}

function debug_code_doGet_memberAttendanceState() {
  const e = {
    parameter: {
      action: "member_attendance_state",
      member_id: "M001",
      location_id: "HONBU",
      billing_block_id: "B_KYO_MON_1030_1230"
    }
  };

  const result = doGet(e);

  Logger.log(result.getContent());

  return result.getContent();
}

function debug_code_doPost_attendanceBatch() {
  const payload = {
    mode: "attendance_batch",
    teacher_id: "T001",
    location_id: "HONBU",
    billing_block_id: "B_KYO_MON_1030_1230",
    attendance_items: [
      {
        member_id: "M001",
        slot_ids: [
          "KYO_MON_1030",
          "KYO_MON_1130"
        ]
      }
    ],
    source: "debug_code_doPost_attendanceBatch"
  };

  const e = {
    postData: {
      contents: JSON.stringify(payload)
    }
  };

  const result = doPost(e);

  Logger.log(result.getContent());

  return result.getContent();
}


// ========================================
// sup_debug_WebConnect.gs
// WebConnect Debug
// ========================================
//
// TYPE: DEBUG
// AREA: WEB
// TAG: WEB_CONNECT
// TAG: DEBUG
//

function debug_webconnect_getPaymentInfo() {
  const e = {
    parameter: {
      action: "getPaymentInfo",
      member_id: "M001",
      plan_id: "P001"
    }
  };

  const result = doGet(e);
  const text = result.getContent();

  Logger.log(text);
  return text;
}

function debug_webconnect_paypayCodeStart() {
  const e = {
    parameter: {
      action: "paypay_code_start",
      member_id: "M001",
      plan_id: "P001",
      teacher_id: "PAYPAY_MEMBER"
    }
  };

  const result = doGet(e);
  const text = result.getContent();

  Logger.log(text);
  return text;
}

function debug_webconnect_paypayCodeStart_M002() {
  const e = {
    parameter: {
      action: "paypay_code_start",
      member_id: "M002",
      plan_id: "P002",
      teacher_id: "PAYPAY_MEMBER"
    }
  };

  const result = doGet(e);
  const text = result.getContent();

  Logger.log(text);
  return text;
}


function debug_webconnect_prepareUnpaid_M001() {
  const ctx = createSheetContext();

  const result = billingMonthlyAccept("M001", "P001", ctx);

  Logger.log(JSON.stringify(result, null, 2));

  const paymentInfo = getMemberPaymentInfo_("M001", "P001", ctx);

  Logger.log(JSON.stringify(paymentInfo, null, 2));

  return {
    ok: paymentInfo && paymentInfo.ok === true,
    billingResult: result,
    paymentInfo: paymentInfo
  };
}

function debug_webconnect_prepareUnpaid_M001_reset() {
  const ctx = createSheetContext();

  const targetMonth = sup_targetMonth(ctx);
  const memberId = "M001";
  const billingGroupId = "G001";

  // 04_月次選択 初期化
  debug_deleteRowsByCondition_("04_月次選択", function(row) {
    return normalizeMonth(row["target_month"]) === normalizeMonth(targetMonth) &&
           normalizeId_(row["billing_group_id"]) === billingGroupId;
  }, ctx);

  // 05_請求明細 初期化
  debug_deleteRowsByCondition_("05_請求明細", function(row) {
    return normalizeMonth(row["target_month"]) === normalizeMonth(targetMonth) &&
           normalizeId_(row["billing_group_id"]) === billingGroupId;
  }, ctx);

  // 06_入金ログ 初期化
  debug_deleteRowsByCondition_("06_入金ログ", function(row) {
    return normalizeMonth(row["target_month"]) === normalizeMonth(targetMonth) &&
           normalizeId_(row["billing_group_id"]) === billingGroupId;
  }, ctx);

  // 09_決済エビデンス 初期化
  debug_deleteRowsByCondition_("09_決済エビデンス", function(row) {
    return normalizeMonth(row["target_month"]) === normalizeMonth(targetMonth) &&
           normalizeId_(row["billing_group_id"]) === billingGroupId;
  }, ctx);

  invalidateMonthlySelections(ctx);
  invalidateInvoices(ctx);
  invalidatePayments(ctx);
  paymentEvidence_invalidate(ctx);
  invalidateFeeStatusView(ctx);

  const billingResult = billingMonthlyAccept(memberId, "P001", ctx);
  const paymentInfo = getMemberPaymentInfo_(memberId, "P001", ctx);

  Logger.log(JSON.stringify({
    billingResult,
    paymentInfo
  }, null, 2));

  return {
    ok: true,
    billingResult,
    paymentInfo
  };
}

function debug_deleteRowsByCondition_(sheetName, predicate, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = getRequiredSheet_(sheetName, ctx);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return 0;

  const headers = values[0];
  let deleted = 0;

  for (let r = values.length - 1; r >= 1; r--) {
    const row = {};
    headers.forEach(function(header, index) {
      row[header] = values[r][index];
    });

    if (predicate(row)) {
      sheet.deleteRow(r + 1);
      deleted++;
    }
  }

  invalidateSheetRows(ctx, sheetName);
  return deleted;
}

function debug_webconnect_paypayCodeRecord_M001() {
  const ctx = createSheetContext();

  const evidences = getPaymentEvidences(ctx).filter(function(e) {
    return normalizeId_(e.member_id) === "M001" &&
           normalizeId_(e.payment_method) === "PAYPAY" &&
           normalizeId_(e.status) === "REQUESTED";
  });

  if (evidences.length === 0) {
    return {
      ok: false,
      message: "M001のREQUESTED PayPay Evidenceがありません。"
    };
  }

  const evidenceItems = evidences.map(function(e) {
    return {
      evidence_id: e.evidence_id
    };
  });

  const payload = {
    mode: "paypay_code_record",
    member_id: "M001",
    evidence_code: "PAYPAY-RUNNER-M001-TEST",
    evidence_items: evidenceItems
  };

  const e = {
    postData: {
      contents: JSON.stringify(payload)
    }
  };

  const result = doPost(e);
  const text = result.getContent();

  Logger.log(text);
  return text;
}

function debug_webconnect_paymentEvidenceList() {
  const e = {
    parameter: {
      action: "payment_evidence_list",
      target_month: "2026-08",
      status: "CONFIRMED"
    }
  };

  const result = doGet(e);
  const text = result.getContent();

  Logger.log(text);
  return text;
}

function debug_webconnect_paymentEvidencePostSelected_M001() {
  const ctx = createSheetContext();

  const evidences = getPaymentEvidences(ctx).filter(function(e) {
    return normalizeId_(e.member_id) === "M001" &&
           normalizeId_(e.status) === "CONFIRMED";
  });

  if (evidences.length === 0) {
    return {
      ok: false,
      message: "M001のCONFIRMED Evidenceがありません。"
    };
  }

  const payload = {
    mode: "payment_evidence_post_selected",
    teacher_id: "T001",
    evidence_items: evidences.map(function(e) {
      return {
        evidence_id: e.evidence_id
      };
    })
  };

  const event = {
    postData: {
      contents: JSON.stringify(payload)
    }
  };

  const result = doPost(event);
  const text = result.getContent();

  Logger.log(text);
  return text;
}

function debug_webconnect_verify_M001() {
  const ctx = createSheetContext();

  const memberId = "M001";
  const billingGroupId = "G001";
  const targetMonth = sup_targetMonth(ctx);
  const normalizedMonth = normalizeMonth(targetMonth);

  const payments = getPayments(ctx).filter(function(p) {
    return normalizeMonth(p["target_month"]) === normalizedMonth &&
           normalizeId_(p["billing_group_id"]) === billingGroupId;
  });

  const evidences = getPaymentEvidences(ctx).filter(function(e) {
    return normalizeId_(e["member_id"]) === memberId &&
           normalizeId_(e["billing_group_id"]) === billingGroupId;
  });

  const invoices = getInvoices(ctx).filter(function(inv) {
    return normalizeMonth(inv["target_month"]) === normalizedMonth &&
           normalizeId_(inv["billing_group_id"]) === billingGroupId;
  });

  const paymentStatus = getPaymentStatus(memberId, ctx);

  const hasPayment = payments.length > 0;
  const hasPosted = evidences.some(function(e) {
    return normalizeId_(e["status"]) === "POSTED";
  });
  const invoicePaid = invoices.length > 0 && invoices.every(function(inv) {
    return String(inv["支払状態"] || "") === "支払済";
  });
  const viewPaid =
    paymentStatus &&
    paymentStatus.ok === true &&
    String(paymentStatus.status || "") === "支払済";

  const result = {
    ok: hasPayment && hasPosted && invoicePaid && viewPaid,
    target_month: normalizedMonth,
    member_id: memberId,
    billing_group_id: billingGroupId,
    checks: {
      hasPayment,
      hasPosted,
      invoicePaid,
      viewPaid
    },
    counts: {
      payments: payments.length,
      evidences: evidences.length,
      invoices: invoices.length
    },
    paymentStatus: paymentStatus,
    message: "M001の会費受付〜入金反映を検証しました。"
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}