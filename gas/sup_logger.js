//
// sup_logger.gs
//

/**
 * ログ出力設定
 */

// ====>> sup_config.js で設定するように変更しました。
//
// const SUP_LOG = {

//   // 出力レベル
//   LEVEL: "DEBUG",          // ERROR / INFO / DEBUG

//   // 出力先
//   CONSOLE: true,
//   LOGGER: false,
//   SHEET: false,

//   // シート名
//   SHEET_NAME: "99_DebugLog"
// };


/**
 * DEBUG
 */
function sup_logDebug(message, data = null) {
  sup_outputLog_("DEBUG", message, data);
}


/**
 * INFO
 */
function sup_logInfo(message, data = null) {
  sup_outputLog_("INFO", message, data);
}


/**
 * ERROR
 */
function sup_logError(message, data = null) {
  sup_outputLog_("ERROR", message, data);
}


/**
 * 共通ログ出力
 */
function sup_outputLog_(level, message, data) {

  const LEVELS = {
    ERROR: 1,
    INFO: 2,
    DEBUG: 3
  };

  if (LEVELS[level] > LEVELS[SUP_LOG.LEVEL]) {
    return;
  }

  const text =
    `[${level}] ${message}` +
    (data == null ? "" : " : " + JSON.stringify(data));

  if (SUP_LOG.CONSOLE) {
    console.log(text);
  }

  if (SUP_LOG.LOGGER) {
    Logger.log(text);
  }

  if (SUP_LOG.SHEET) {
    sup_appendLogSheet_(level, message, data);
  }
}


/**
 * デバッグシートへ出力
 */
function sup_appendLogSheet_(level, message, data) {

  const sheet =
    SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SUP_LOG.SHEET_NAME);

  if (!sheet) return;

  sheet.appendRow([
    new Date(),
    level,
    message,
    JSON.stringify(data)
  ]);
}



//* 使い方
// ① 普通のログ
// sup_logDebug("開始");
// [DEBUG] 開始

// ② データ付き
// sup_logDebug("会員情報取得", member);
// [DEBUG] 会員情報取得 :
// {"member_id":"M001"...}

// ③ エラー
// sup_logError("member_idが存在しません", memberId);

// ④ リリース時
// ここだけ変更します。
// LEVEL: "ERROR",

// CONSOLE: false,
// LOGGER: false,
// SHEET: false

// すると、

// sup_logDebug(...)
// sup_logInfo(...)

// は一切出ません。

// Ver2で追加予定

// ここまでは今回は不要ですが、将来的には追加したいですね。

// sup_logPerf(...)
// [PERF] makeInvoice 32ms
// sup_logPayment(...)
// [PAYMENT]
// sup_logAttendance(...)
// [ATTEND]

// 旧ログ処理
const DEBUG_PERF = true;

function perfLog(label, t0) {

  if (!DEBUG_PERF) return;

  Logger.log(
    `[PERF] ${label} ms=${Date.now() - t0}`
  );
}

