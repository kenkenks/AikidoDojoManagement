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
        teacher_id: params.teacher_id || "PAYPAY_MEMBER",
        location_id: params.location_id || "",
        billing_block_id: params.billing_block_id || "",
        reception_session_id: params.reception_session_id || ""
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

  if (params.action === "qr_generator_options") {
    const result = safelyExecute_(function() {
      return qrGenerator_getOptions(ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "system_context") {
    const result = safelyExecute_(function() {
      return sup_timeTravel_getSystemContext(ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "diagnostic_post_result") {
    const token = String(params.token || "").trim();
    const cached = token ? CacheService.getScriptCache().get("DIAG_POST_" + token) : "";
    const result = cached
      ? JSON.parse(cached)
      : { ok:false, received:false, token:token, message:"POST受信記録はまだありません。" };
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "post_receipt") {
    const requestId = String(params.request_id || "").trim();
    const cached = requestId ? CacheService.getScriptCache().get("WEB_POST_RECEIPT_" + requestId) : "";
    const result = cached
      ? JSON.parse(cached)
      : { ok:false, completed:false, request_id:requestId, message:"処理完了を待っています。" };
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "payment_reception_summary") {
    const result = safelyExecute_(function() {
      return paymentReception_getScopeSummary({
        reception_date: params.reception_date || "",
        location_id: params.location_id || "",
        billing_block_id: params.billing_block_id || ""
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

  if (params.action === "attendance_saved_state") {
    const result = safelyExecute_(function() {
      return getAttendanceSavedState(params, ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "teacher_attendance_today") {
    const result = safelyExecute_(function() {
      return attendanceTeacherGetTodayOverview(params, ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "teacher_attendance_state") {
    const result = safelyExecute_(function() {
      return teacherAttendance_getState({
        teacher_id:params.teacher_id || "",
        attendance_date:params.attendance_date || "",
        location_id:params.location_id || "",
        billing_block_id:params.billing_block_id || ""
      }, ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "teacher_attendance_identity") {
    const result = safelyExecute_(function() {
      return teacherAttendance_resolveIdentity({
        teacher_id:params.teacher_id || "",
        member_id:params.member_id || ""
      }, ctx);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "teacher_attendance_monthly_summary") {
    const result = safelyExecute_(function() {
      return teacherAttendance_getMonthlySummary({ target_month:params.target_month || sup_targetMonth(ctx) }, ctx);
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
  ctx = ensureSheetContext(ctx || createSheetContext());

  // 20_会費状態View を最初の参照点にする。
  // 通常の運用では出席時点で 04/05 と View が確定済みなので、
  // 支払い画面で同じ正本を再探索・再確定しない。
  const paymentStatus = getPaymentStatus(memberId, ctx);
  if (!paymentStatus || paymentStatus.ok !== true) return paymentStatus;

  sup_logDebug("getMemberPaymentInfo_", { memberId: memberId, plan_id: plan_id }, ctx);

  let plan_id_r = normalizeId_(plan_id);
  if (String(plan_id_r).toLowerCase() === "undefined" || String(plan_id_r).toLowerCase() === "null") {
    plan_id_r = "";
  }

  const viewPlanId = normalizeId_(paymentStatus.planType);
  const invoiceItems = Array.isArray(paymentStatus.invoiceItems)
    ? paymentStatus.invoiceItems
    : [];
  const hasCurrentInvoice = Number(paymentStatus.invoiceCount || invoiceItems.length || 0) > 0;

  // Fast path:
  // 20 に当月の会費タイプと請求が既に存在するなら、それが支払い画面の入力情報。
  // plan_id 未指定の通常会員QRは 04 を再読込せず View から復元する。
  // 旧QR等で plan_id が明示されても View と一致していれば再確定処理は不要。
  if (!plan_id_r && viewPlanId) {
    plan_id_r = viewPlanId;
  }
  if (plan_id_r && viewPlanId && normalizeId_(plan_id_r) === viewPlanId && hasCurrentInvoice) {
    return getMemberPaymentInfoResponse_(memberId, plan_id_r, paymentStatus);
  }

  // Fallback:
  // View にまだ当月状態が無い経路だけ、従来どおり 04/料金マスタから補完する。
  // 支払い側に補完的な会費タイプ確定能力を残すための経路。
  if (!plan_id_r) {
    const memberRow = getMembers(ctx).find(function(row) {
      return normalizeId_(row["member_id"]) === normalizeId_(memberId);
    });
    const billingGroupId = memberRow ? normalizeId_(memberRow["請求グループID"]) : "";
    const selection = billingGroupId
      ? billing_getMonthlySelection(billingGroupId, sup_targetMonth(ctx), ctx)
      : null;
    plan_id_r = selection ? normalizeId_(selection["plan_id"]) : "";
  }

  if (!plan_id_r) {
    return {
      success: false,
      ok: false,
      memberId: memberId,
      memberName: paymentStatus.memberName || "",
      message: "今月の会費タイプが未登録です。出席登録または会費タイプ選択を行ってください。"
    };
  }

  try {
    const fee = getFees(ctx).find(function(row) {
      return normalizeId_(row["plan_id"]) === normalizeId_(plan_id_r) && isActiveMasterRow_(row);
    });
    const billingResult = fee && String(fee["会費タイプ"] || "").trim() === "審査費"
      ? billingExtraEnsureInvoice(memberId, plan_id_r, ctx)
      : billing_acceptMonthlySelection(memberId, plan_id_r, ctx);
    Logger.log(JSON.stringify(billingResult, null, 2));

    if (!billingResult || billingResult.ok !== true) {
      return {
        success: false,
        ok: false,
        memberId: memberId,
        memberName: paymentStatus.memberName || "",
        planId: plan_id_r,
        message: billingResult && billingResult.message
          ? billingResult.message
          : "会費タイプの宣言に失敗しました。"
      };
    }
  } catch (e) {
    return {
      success: false,
      ok: false,
      memberId: memberId,
      memberName: paymentStatus.memberName || "",
      planId: plan_id_r,
      message: "会費タイプの宣言に失敗しました: " + e.message
    };
  }

  const refreshedStatus = getPaymentStatus(memberId, ctx);
  if (!refreshedStatus || refreshedStatus.ok !== true) {
    return {
      success: false,
      ok: false,
      memberId: memberId,
      memberName: paymentStatus.memberName || "",
      message: refreshedStatus && refreshedStatus.message
        ? refreshedStatus.message
        : "会費情報を取得できませんでした。"
    };
  }

  return getMemberPaymentInfoResponse_(memberId, plan_id_r, refreshedStatus);
}

function getMemberPaymentInfoResponse_(memberId, planId, paymentStatus) {
  const invoiceItems = Array.isArray(paymentStatus.invoiceItems)
    ? paymentStatus.invoiceItems
    : [];

  return {
    success: true,
    ok: true,
    memberId: paymentStatus.memberId || memberId,
    memberName: paymentStatus.memberName || "",
    billingGroupId: paymentStatus.billingGroupId || "",
    invoiceIds: paymentStatus.invoiceIds || invoiceItems.map(function(item) { return item.invoice_id; }),
    invoiceCount: Number(paymentStatus.invoiceCount || invoiceItems.length || 0),
    invoiceSummary: paymentStatus.invoiceSummary || "",
    invoiceItems: invoiceItems,
    targetMonth: paymentStatus.targetMonth || "",
    planId: planId,
    feeType: paymentStatus.planType || planId || "未設定",
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
  let requestData = null;

  const result = safelyExecute_(function() {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("送信データがありません。");
    }

    const jsonText = e.parameter && e.parameter.payload
      ? e.parameter.payload
      : e.postData.contents;
    const data = JSON.parse(jsonText);
    requestData = data;

    if (data.mode === "diagnostic_ping") {
      const token = String(data.token || "").trim();
      if (!token) throw new Error("diagnostic_ping: tokenがありません。");
      const receipt = {
        ok:true,
        received:true,
        token:token,
        received_at:sup_formatDate_(ctx, "yyyy-MM-dd HH:mm:ss"),
        message:"HTMLからのPOSTをGASで受信しました。"
      };
      CacheService.getScriptCache().put("DIAG_POST_" + token, JSON.stringify(receipt), 600);
      return receipt;
    }

    if (data.mode === "attendance_batch" || Array.isArray(data.attendance_items)) {
      return registerAttendanceBatch(data, ctx);
    }

    if (data.mode === "teacher_attendance_sync") {
      return teacherAttendance_sync(data, ctx);
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

  const requestId = requestData && String(requestData.request_id || "").trim();
  if (requestId) {
    CacheService.getScriptCache().put("WEB_POST_RECEIPT_" + requestId, JSON.stringify({
      ok:result && result.ok === true,
      completed:true,
      request_id:requestId,
      message:(result && result.message) || (result && result.ok === true ? "処理が完了しました。" : "処理に失敗しました。"),
      errorName:(result && result.errorName) || ""
    }), 600);
  }

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
