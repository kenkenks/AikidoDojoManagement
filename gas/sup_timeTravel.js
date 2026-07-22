//
// sup_timeTravel.gs
// タイムトリップ共通
//

const SUP_TIME_TRAVEL = {

  // デフォルト（本番は false）
  enabled: false,

  // デフォルト日時
  now: "",

  // 強制対象月（通常は空）
  targetMonth: "",

  // デバッグログ
  debug: false
};

/**
 * 現在日時取得
 */
function sup_now(ctx) {

  const setting = sup_getTimeTravelSetting_(ctx);

  if (setting.enabled && setting.now) {
    return new Date(setting.now);
  }

  return new Date();
}

/**
 * 今日
 */
function sup_today(ctx) {

  return Utilities.formatDate(
    sup_now(ctx),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
}

/**
 * 対象月
 */
function sup_targetMonth(ctx) {

  const setting = sup_getTimeTravelSetting_(ctx);

  if (setting.enabled && setting.targetMonth) {
    return setting.targetMonth;
  }

  return Utilities.formatDate(
    sup_now(ctx),
    Session.getScriptTimeZone(),
    "yyyy-MM"
  );
}

function sup_formatDate_(ctx, format) {
  return Utilities.formatDate(
    sup_now(ctx),
    Session.getScriptTimeZone(),
    format
  );
}

/**
 * タイムトリップ設定取得
 *
 * 優先順位
 * ① ctx.settings
 * ② SUP_TIME_TRAVEL
 */
function sup_getTimeTravelSetting_(ctx) {

  const result = {
    enabled: SUP_TIME_TRAVEL.enabled,
    now: SUP_TIME_TRAVEL.now,
    targetMonth: SUP_TIME_TRAVEL.targetMonth,
    debug: SUP_TIME_TRAVEL.debug
  };

  if (!ctx || !ctx.settings) {
    return result;
  }

  const s = ctx.settings;

  if (s.TIME_TRAVEL_ENABLED !== undefined) {
    result.enabled =
      String(s.TIME_TRAVEL_ENABLED).toUpperCase() === "TRUE";
  }

  if (s.DEBUG_DATE) {
    result.now = s.DEBUG_DATE;
  }

  if (s.DEBUG_TARGET_MONTH) {
    result.targetMonth = s.DEBUG_TARGET_MONTH;
  }

  if (s.DEBUG !== undefined) {
    result.debug =
      String(s.DEBUG).toUpperCase() === "TRUE";
  }

  return result;
}

function sup_formatTargetMonth_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "yyyy-MM"
  );
}

function sup_timeTravel_getSystemContext(ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  const setting = sup_getTimeTravelSetting_(ctx);
  return {
    ok: true,
    time_travel_enabled: setting.enabled === true,
    system_now: Utilities.formatDate(sup_now(ctx), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    target_month: sup_targetMonth(ctx),
    timezone: Session.getScriptTimeZone()
  };
}

function sup_timeTravel_getAdminSetting() {
  const ctx = createSheetContext();
  const setting = sup_getTimeTravelSetting_(ctx);
  return {
    ok: true,
    enabled: setting.enabled === true,
    now: setting.now && !isNaN(new Date(setting.now).getTime()) ? new Date(setting.now).toISOString() : "",
    target_month: setting.targetMonth || "",
    effective: sup_timeTravel_getSystemContext(ctx)
  };
}

function sup_timeTravel_saveAdminSetting(input) {
  input = input || {};
  const ctx = createSheetContext();
  const enabled = input.enabled === true || String(input.enabled).toUpperCase() === "TRUE";
  const debugDate = enabled ? String(input.now || "").trim() : "";
  const targetMonth = enabled ? normalizeMonth(input.target_month || "") : "";
  if (enabled && (!debugDate || isNaN(new Date(debugDate).getTime()))) {
    return { ok: false, message: "有効にする場合はテスト日時を指定してください。" };
  }
  if (enabled && !/^\d{4}-\d{2}$/.test(targetMonth)) {
    return { ok: false, message: "有効にする場合は対象月を指定してください。" };
  }

  sup_timeTravel_writeSettings_({
    TIME_TRAVEL_ENABLED: enabled ? "TRUE" : "FALSE",
    DEBUG_DATE: debugDate,
    DEBUG_TARGET_MONTH: targetMonth
  }, ctx);
  ctx.settings = sup_loadSettings(ctx);
  return {
    ok: true,
    message: enabled ? "テスト時刻を有効にしました。" : "実時刻へ戻しました。",
    effective: sup_timeTravel_getSystemContext(ctx)
  };
}

function sup_timeTravel_writeSettings_(updates, ctx) {
  const sheet = ctx.ss.getSheetByName("99_設定");
  if (!sheet) throw new Error("99_設定シートがありません。");
  const values = sheet.getDataRange().getValues();
  const rowByKey = {};
  for (let row = 1; row < values.length; row++) {
    const key = String(values[row][0] || "").trim();
    if (key) rowByKey[key] = row + 1;
  }
  Object.keys(updates).forEach(function(key) {
    if (rowByKey[key]) {
      sheet.getRange(rowByKey[key], 2).setValue(updates[key]);
    } else {
      sheet.appendRow([key, updates[key]]);
    }
  });
}

function showTimeTravelDialog() {
  const html = HtmlService.createHtmlOutputFromFile("time_travel")
    .setWidth(460)
    .setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, "テスト時刻設定");
}

// この設計で一番気に入っている点
// 
// sup_timeTravel.gs は 99_設定シートを知りません。
// つまり、
// 
// 99_設定
//         ↓
// sup_loadSettings()
//         ↓
// ctx.settings
//        ↓
// sup_now(ctx)

// という流れになります。

// 役割がきれいに分離されます。

// sup_timeTravel.gs … 「設定を使って日時を返す」
// sup_config.gs（または設定読込） … 「99_設定を読む」
// createSheetContext() … 「ctx.settings を持つ」

// この構成なら、将来シートから PropertiesService やデータベースに設定の保存先を変えても、sup_timeTravel.gs は一切変更しなくて済みます。
// 私は、この「設定の取得元を知らない共通ライブラリ」という形が、長く保守するには最もきれいな設計だと思います。
