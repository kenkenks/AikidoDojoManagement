// =======onth=================================
// WebConnect.gs
// Web Entry Point
// ========================================
//
// TYPE: WEB_CONNECT
// AREA: WEB
// TAG: WEB_CONNECT
// TAG: MEMBER
// TAG: TEACHER
// TAG: PAYMENT
//
// RESPONSIBILITY
// Browser と Service の接続点。
// doGet / doPost による画面表示・JSON API入口を担当する。
//
// ENTRY MAP
//
// GET
//   getMemberInfo
//     → getPaymentStatus()
//     → 会員情報・会費状態取得
//
//   getPaymentInfo
//     → getMemberPaymentInfo_()
//     → 会費情報取得・月額請求作成
//
//   paypay_code_start
//     → paypayCode_start()
//     → PayPay受付開始 / REQUESTED作成
//
//   payment_evidence_list
//     → paymentEvidenceQuery_list()
//     → 先生画面用CONFIRMED一覧取得
//
//   teacher_payment_status
//     → paymentStatusTeacher_get()
//     → 先生画面用の期間入金集計・会員別月次状況
//
// POST
//   paypay_code_record
//     → paypayCode_record()
//     → PayPay決済コード登録 / CONFIRMED化
//
//   payment_evidence_post_selected
//     → paymentEvidence_postSelectedBatch()
//     → 先生選択分の入金反映
//
//   payment_evidence_post_batch
//     → paymentEvidence_postBatch()
//     → CONFIRMED一括入金反映
//
//   payment_batch / paymentEvidence_acceptBatch
//     → paymentEvidence_acceptBatch()
//     → 決済エビデンス一括受付
//

// GETリクエストの処理
// 例: https://script.google.com/macros/s/AKfycbx.../exec?action=getMemberInfo&member_id=12345
function doGet(e) {
  const params = (e && e.parameter) || {};

  const ctx = createSheetContext();

  sup_logDebug("doGet", {
    action: params.action,
    member_id: params.member_id,
    plan_id: params.plan_id,
    location_id: params.location_id,
    billing_block_id: params.billing_block_id
  }, ctx);

  if (params.action === "getMemberInfo") {
    const result = safelyExecute_(function() {
      return getPaymentStatus(params.member_id || "", ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "getPaymentInfo") {
    sup_logDebug("doGet", { action: params.action, member_id: params.member_id, plan_id: params.plan_id }, ctx);

    const result = safelyExecute_(function() {
      return getMemberPaymentInfo_(params.member_id || "", params.plan_id || "", ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "paypay_code_start") {
    const result = safelyExecute_(function() {
      return paypayCode_start({
        member_id: params.member_id || "",
        plan_id: params.plan_id || "",
        teacher_id: params.teacher_id || "PAYPAY_MEMBER"
      }, ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "payment_evidence_list") {
    const result = safelyExecute_(function() {
      return paymentEvidenceQuery_list({
        target_month: params.target_month || sup_targetMonth(ctx),
        status: params.status || "CONFIRMED",
        statuses: params.statuses || params.status || "CONFIRMED",
        payment_method: params.payment_method || ""
      }, ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "teacher_payment_status") {
    const result = safelyExecute_(function() {
      return paymentStatusTeacher_get({
        date_from: params.date_from || "",
        date_to: params.date_to || "",
        target_month: params.target_month || sup_targetMonth(ctx)
      }, ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "attendance_session_info") {
    const result = safelyExecute_(function() {
      return getAttendanceSessionInfo(params, ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "member_attendance_state") {
    const result = safelyExecute_(function() {
      return getMemberAttendanceState(params, ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "teacher_attendance_today") {
    const result = safelyExecute_(function() {
      return attendanceTeacherGetTodayOverview(params, ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "attendance_progress_summary") {
    const result = safelyExecute_(function() {
      return attendanceProgress_getMemberSummary(params.member_id || "", ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "attendance_rank_options") {
    const result = safelyExecute_(function() {
      return { ok: true, rank_options: rankMaster_getOptions(ctx) };
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  const template = HtmlService.createTemplateFromFile("index");
  template.memberId = params.member_id || "";
  return template.evaluate()
    .setTitle("道場会費確認")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getMemberPaymentInfo_(memberId, plan_id, ctx) {
  const member = getPaymentStatus(memberId, ctx);
  if (!member || member.ok !== true) return member;

  sup_logDebug("getMemberPaymentInfo_", { memberId: memberId, plan_id: plan_id }, ctx);

  const plan_id_r = plan_id || "P002";
  try {
    const fee = getFees(ctx).find(function(row) {
      return normalizeId_(row["plan_id"]) === normalizeId_(plan_id_r) && isActiveMasterRow_(row);
    });
    const billingResult = fee && String(fee["会費タイプ"] || "").trim() === "審査費"
      ? billingExtraEnsureInvoice(memberId, plan_id_r, ctx)
      : billing_acceptMonthlySelection(memberId, plan_id_r, ctx);
    Logger.log(JSON.stringify(billingResult, null, 2));
  } catch (e) {
    Logger.log("Error occurred: " + e.toString());
  }

  const paymentStatus = getPaymentStatus(memberId, ctx);
  if (!paymentStatus || paymentStatus.ok !== true) {
    return {
      success: false,
      ok: false,
      memberId: memberId,
      memberName: member.memberName || "",
      message: paymentStatus && paymentStatus.message
        ? paymentStatus.message
        : "会費情報を取得できませんでした。"
    };
  }

  const invoiceItems = Array.isArray(paymentStatus.invoiceItems)
    ? paymentStatus.invoiceItems
    : [];

  return {
    success: true,
    ok: true,
    memberId: paymentStatus.memberId || memberId,
    memberName: paymentStatus.memberName || member.memberName || "",
    billingGroupId: paymentStatus.billingGroupId || "",
    invoiceIds: paymentStatus.invoiceIds || invoiceItems.map(function(item) { return item.invoice_id; }),
    invoiceCount: Number(paymentStatus.invoiceCount || invoiceItems.length || 0),
    invoiceSummary: paymentStatus.invoiceSummary || "",
    invoiceItems: invoiceItems,
    targetMonth: paymentStatus.targetMonth || "",
    planId: plan_id_r,
    feeType: paymentStatus.planType || plan_id_r || "未設定",
    billedTotal: Number(paymentStatus.billedTotal || 0),
    paidTotal: Number(paymentStatus.paidTotal || 0),
    amount: Number(paymentStatus.unpaidAmount || 0),
    isPaid: paymentStatus.isPaid === true,
    status: paymentStatus.status || "",
    message: paymentStatus.message || ""
  };
}

// POSTリクエストの処理
// 例: https://script.google.com/macros/s/AKfycbx.../exec
function doPost(e) {
  const ctx = createSheetContext();

  const result = safelyExecute_(function() {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("送信データがありません。");
    }

    const jsonText = e.postData.contents;
    const data = JSON.parse(jsonText);

    if (data.mode === "attendance_batch" || Array.isArray(data.attendance_items)) {
      return registerAttendanceBatch(data, ctx);
    }

    if (data.mode === "paypay_code_record") {
      return paypayCode_record(data, ctx);
    }

    if (data.mode === "payment_evidence_post_selected") {
      return paymentEvidence_postSelectedBatch(data, ctx);
    }

    if (data.mode === "payment_evidence_post_batch") {
      return paymentEvidence_postBatch(ctx);
    }

    if (
      data.mode === "payment_batch" ||
      data.mode === "paymentEvidence_acceptBatch" ||
      Array.isArray(data.payment_items) ||
      Array.isArray(data.payments)
    ) {
      return paymentEvidence_acceptBatch(data, ctx);
    }

    appendQrExperimentLog(data, jsonText, ctx);

    return {
      ok: true,
      legacy: true,
      message: "QR実験ログへ保存しました。"
    };
  });

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function safelyExecute_(callback) {
  try {
    return callback();

  } catch (e) {
    Logger.log(e.stack || e.message);

    return {
      ok: false,
      error: true,
      message: e.message || String(e),
      errorName: e.name || "Error",
      stack: e.stack || ""
    };
  }
}

function createJsonOrJsonpOutput_(data, callbackName) {
  const json = JSON.stringify(data);
  const callback = String(callbackName || "").trim();

  if (callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function appendBatchAttendanceDemoLog(data, raw, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("QR_出席登録デモログ");
  if (!sheet) throw new Error("QR_出席登録デモログ シートが見つかりません。");

  const now = sup_now(ctx);
  const rows = data.member_ids.map(function(memberId) {
    return [
      now,
      data.teacher_id || "",
      data.location_id || "",
      memberId,
      data.source || "",
      raw
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function appendQrExperimentLog(data, raw, ctx) {
  ctx = ensureSheetContext(ctx);

  const sheet = ctx.ss.getSheetByName("QR実験ログ");
  if (!sheet) throw new Error("QR実験ログ シートが見つかりません。");

  sheet.appendRow([
    sup_now(ctx),
    data.member_id || "",
    data.location_id || "",
    data.source || "",
    raw
  ]);
}
