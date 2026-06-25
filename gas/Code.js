function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.action === "getMemberInfo") {
    const result = safelyExecute_(function() {
      return getMemberInfoForPayment(params.member_id || "");
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "getPaymentInfo") {
    const result = safelyExecute_(function() {
      return getMemberPaymentInfo_(params.member_id || "", params.plan_id || "");
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "attendance_session_info") {
    const result = safelyExecute_(function() {
      return getAttendanceSessionInfo(params);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  if (params.action === "member_attendance_state") {
    const result = safelyExecute_(function() {
      return getMemberAttendanceState(params);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  const template = HtmlService.createTemplateFromFile("index");
  template.memberId = params.member_id || "";
  return template.evaluate()
    .setTitle("道場会費確認")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getMemberPaymentInfo_(memberId, plan_id) {
  const member = getMemberInfoForPayment(memberId);
  if (!member || member.success !== true) return member;

  const plan_id_r =  plan_id || "P002";
  try {
    result = billing_acceptMonthlySelection(memberId, plan_id_r);
    Logger.log(JSON.stringify(result, null, 2));
  } catch (e) {
    Logger.log("Error occurred: " + e.toString());
  }

  const paymentStatus = getPaymentStatus(member.memberId);
  if (!paymentStatus || paymentStatus.ok !== true) {
    return {
      success: false,
      memberId: member.memberId,
      memberName: member.memberName,
      message: paymentStatus && paymentStatus.message
        ? paymentStatus.message
        : "会費情報を取得できませんでした。"
    };
  }

  return {
    success: true,
    memberId: member.memberId,
    memberName: member.memberName,
    billingGroupId: paymentStatus.billingGroupId || "",
    targetMonth: paymentStatus.targetMonth || "",
    feeType: paymentStatus.planType || "未設定",
    billedTotal: Number(paymentStatus.billedTotal || 0),
    paidTotal: Number(paymentStatus.paidTotal || 0),
    amount: Number(paymentStatus.unpaidAmount || 0),
    isPaid: paymentStatus.isPaid === true,
    status: paymentStatus.status || ""
  };
}

function doPost(e) {
  const result = safelyExecute_(function() {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("送信データがありません。");
    }

    const jsonText = e.postData.contents;
    const data = JSON.parse(jsonText);

    if (data.mode === "attendance_batch" || Array.isArray(data.attendance_items)) {
      return registerAttendanceBatch(data);
    }
    
    if (data.mode === "payment_batch" || Array.isArray(data.payment_items)) {
      return registerPaymentBatch(data);
    }

    // 移行期間中は旧QR実験データも受け付ける。
    if (Array.isArray(data.member_ids)) {
      appendBatchAttendanceDemoLog(data, jsonText);
      return { ok: true, legacy: true, message: "旧形式のデモログへ保存しました。" };
    }

    appendQrExperimentLog(data, jsonText);
    return { ok: true, legacy: true, message: "QR実験ログへ保存しました。" };
  });

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function safelyExecute_(callback) {
  try {
    return callback();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return {
      ok: false,
      message: error && error.message ? error.message : String(error)
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

function appendBatchAttendanceDemoLog(data, raw) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("QR_出席登録デモログ");
  if (!sheet) throw new Error("QR_出席登録デモログ シートが見つかりません。");

  const now = new Date();
  const rows = data.member_ids.map(memberId => [
    now,
    data.teacher_id || "",
    data.location_id || "",
    memberId,
    data.source || "",
    raw
  ]);

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function appendQrExperimentLog(data, raw) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("QR実験ログ");
  if (!sheet) throw new Error("QR実験ログ シートが見つかりません。");

  sheet.appendRow([
    new Date(),
    data.member_id || "",
    data.location_id || "",
    data.source || "",
    raw
  ]);
}
