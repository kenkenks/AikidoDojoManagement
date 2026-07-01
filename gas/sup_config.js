//
// sup_config.gs
//

const SUP_LOG = {
    LEVEL: "DEBUG",
    CONSOLE: true,
    LOGGER: false,
    SHEET: true,
    SHEET_NAME: "99_DebugLog"
};


//
// sup_config.gs
// システム設定
//

function getSettings(ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  return ctx.settingsSheet;
}

/**
 * システム設定読込
 *
 * 戻り値
 * {
 *   WEB_APP_URL : "...",
 *   DEBUG_DATE : "...",
 *   TIME_TRAVEL_ENABLED : "TRUE"
 * }
 */
function sup_loadSettings(ctx) {
  const settings = {};

  if (!ctx || !ctx.ss) {
    return settings;
  }

  const sheet = ctx.ss.getSheetByName("99_設定");
  if (!sheet) {
    return settings;
  }

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] || "").trim();
    if (!key) continue;

    settings[key] = values[i][1];
  }

  return settings;
}

/**
 * 設定取得
 */
function sup_getSetting(ctx, key, defaultValue) {

  if (!ctx.settings) {
    ctx.settings = sup_loadSettings(ctx);
  }

  return ctx.settings[key] !== undefined
    ? ctx.settings[key]
    : defaultValue;
}