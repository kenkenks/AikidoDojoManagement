function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.action === "attendance_session_info") {
    const result = safelyExecute_(function() {
      return getAttendanceSessionInfo(params);
    });
    return createJsonOrJsonpOutput_(result, params.callback);
  }

  return HtmlService
    .createHtmlOutputFromFile("index")
    .setTitle("道場管理システム");
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
