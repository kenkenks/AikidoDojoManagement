// Step 2-D: Portable TimeTrip real GAS / real Spreadsheet smoke.
// Existing sup_timeTravel.js and production 99_設定 route are intentionally untouched.
function dojoTimeTravelStep2Application_(spreadsheet) {
  return DojoTimeTravelStep2.createApplication({
    spreadsheet: spreadsheet || SpreadsheetApp.getActiveSpreadsheet(),
    timezone: Session.getScriptTimeZone(),
    formatDate: function(date, zone, pattern) {
      return Utilities.formatDate(date, zone, pattern);
    }
  });
}

function runner_timeTravelStep2_realSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = '__PORTABLE_TT_' + Utilities.getUuid().slice(0, 8);
  var sheet = ss.insertSheet(name);
  try {
    sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    sheet.getRange(2, 1, 2, 2).setValues([
      ['TIME_TRAVEL_ENABLED', 'FALSE'],
      ['DEBUG', 'TRUE']
    ]);

    // Redirect only this smoke application's "99_設定" lookup to the temporary real Sheet.
    var testSpreadsheet = {
      getSheetByName: function(sheetName) {
        return sheetName === '99_設定' ? sheet : null;
      }
    };
    var app = dojoTimeTravelStep2Application_(testSpreadsheet);

    var initial = app.getTimeTravel();
    if (initial.enabled !== false) throw new Error('INITIAL_READ_FAILED');

    var enabled = app.saveTimeTravel({
      enabled: true,
      now: '2099-07-09T10:00:00+09:00',
      target_month: '2099-07'
    });
    if (!enabled.ok || enabled.effective.target_month !== '2099-07') {
      throw new Error('CREATE_FAILED');
    }

    var updated = app.saveTimeTravel({
      enabled: true,
      now: '2099-07-10T10:00:00+09:00',
      target_month: '2099-08'
    });
    if (!updated.ok || updated.effective.target_month !== '2099-08') {
      throw new Error('UPDATE_FAILED');
    }
    if (sheet.getLastRow() !== 5) throw new Error('UNEXPECTED_ROW_COUNT');

    var reread = app.getTimeTravel();
    if (reread.target_month !== '2099-08') throw new Error('READ_AGAIN_FAILED');

    var disabled = app.saveTimeTravel({enabled:false});
    if (!disabled.ok || disabled.effective.time_travel_enabled) {
      throw new Error('DISABLE_FAILED');
    }

    var values = sheet.getDataRange().getValues();
    var debugRow = values.filter(function(row) { return row[0] === 'DEBUG'; })[0];
    if (!debugRow || String(debugRow[1]).toUpperCase() !== 'TRUE') {
      throw new Error('DEBUG_PRESERVATION_FAILED');
    }

    var result = {
      ok: true,
      message: 'TIME-TRAVEL-STEP2 REAL SHEETS PASS',
      success: 5,
      sheet: name,
      checks: ['READ','CREATE','UPDATE','READ_AGAIN','DISABLE']
    };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    ss.deleteSheet(sheet);
  }
}
