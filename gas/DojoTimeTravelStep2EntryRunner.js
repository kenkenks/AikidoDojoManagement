//
// Step 2-E: existing sup_timeTravel entry -> Portable DAO -> real Google Sheets
//
// 本番 99_設定は変更しない。一時シートを実Sheetとして使い、finallyで必ず削除する。
//
function runner_timeTravelStep2_existingEntry_realSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = '__PORTABLE_ENTRY_' + Utilities.getUuid().slice(0, 8);
  var sheet = ss.insertSheet(name);

  try {
    sheet.getRange(1, 1, 3, 2).setValues([
      ['key', 'value'],
      ['TIME_TRAVEL_ENABLED', 'FALSE'],
      ['DEBUG', 'TRUE']
    ]);

    // Portable DAO から見た 99_設定だけを、一時実Sheetへ差し替える。
    var testSpreadsheet = {
      getSheetByName: function(sheetName) {
        return sheetName === '99_設定' ? sheet : ss.getSheetByName(sheetName);
      }
    };

    // 1. READ: 既存公開入口から初期値を読む。
    var initial = sup_timeTravel_getAdminSetting(testSpreadsheet);
    if (!initial || initial.enabled !== false) {
      throw new Error('ENTRY_READ_FAILED');
    }

    // 2. UPSERT_CREATE: 既存公開入口から設定を作成する。
    var created = sup_timeTravel_saveAdminSetting({
      enabled: true,
      now: '2099-07-09T10:00:00+09:00',
      target_month: '2099-07'
    }, testSpreadsheet);

    if (!created || !created.ok ||
        created.effective.system_now !== '2099-07-09 10:00:00' ||
        created.effective.target_month !== '2099-07') {
      throw new Error('ENTRY_CREATE_FAILED');
    }

    // 3. UPSERT_UPDATE: 同じ入口から既存行を更新する。
    var updated = sup_timeTravel_saveAdminSetting({
      enabled: true,
      now: '2099-07-10T10:00:00+09:00',
      target_month: '2099-08'
    }, testSpreadsheet);

    if (!updated || !updated.ok ||
        updated.effective.system_now !== '2099-07-10 10:00:00' ||
        updated.effective.target_month !== '2099-08') {
      throw new Error('ENTRY_UPDATE_FAILED');
    }

    // CREATE後は設定4項目 + header = 5行。UPDATEで行が増えてはいけない。
    if (sheet.getLastRow() !== 5) {
      throw new Error('ENTRY_UPDATE_APPENDED_DUPLICATE');
    }

    // 4. READ AGAIN: 既存公開入口で再読込。
    var reread = sup_timeTravel_getAdminSetting(testSpreadsheet);
    if (!reread || !reread.enabled ||
        !reread.effective ||
        reread.effective.system_now !== '2099-07-10 10:00:00' ||
        reread.effective.target_month !== '2099-08') {
      throw new Error('ENTRY_READ_AGAIN_FAILED');
    }

    // 5. DISABLE
    var disabled = sup_timeTravel_saveAdminSetting({
      enabled: false
    }, testSpreadsheet);

    if (!disabled || !disabled.ok ||
        disabled.effective.time_travel_enabled !== false) {
      throw new Error('ENTRY_DISABLE_FAILED');
    }

    // DEBUGはPortable処理が破壊してはいけない。
    var values = sheet.getDataRange().getValues();
    var debugRow = values.filter(function(row) {
      return row[0] === 'DEBUG';
    })[0];

    if (!debugRow || String(debugRow[1]).toUpperCase() !== 'TRUE') {
      throw new Error('ENTRY_DEBUG_PRESERVATION_FAILED');
    }

    var result = {
      ok: true,
      message: 'TIME-TRAVEL-STEP2 EXISTING ENTRY REAL SHEETS PASS',
      success: 5,
      sheet: name,
      checks: ['READ', 'UPSERT_CREATE', 'UPSERT_UPDATE', 'READ_AGAIN', 'DISABLE']
    };

    console.log(JSON.stringify(result));
    return result;
  } finally {
    ss.deleteSheet(sheet);
  }
}
