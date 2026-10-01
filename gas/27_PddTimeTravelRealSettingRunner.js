// PDD001 final GAS E2E runner.
// Uses the real PDD-created Setting sheet and intentionally leaves the final state visible.
function runner_pdd001_timeTravelRealSetting() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settingDescription = dojoPddDescribeSettingGas_();
  var settingSheetName = settingDescription.sheet;
  var sheet = ss.getSheetByName(settingSheetName);
  if (!sheet) throw new Error('PDD001_TIME_TRAVEL_MISSING: ' + settingSheetName);

  var app = dojoTimeTravelStep2Application_(ss);
  var checks = [];

  var initial = app.getTimeTravel();
  if (!initial || typeof initial.enabled !== 'boolean') throw new Error('PDD001_TIME_TRAVEL_READ_FAILED');
  checks.push('READ');

  var created = app.saveTimeTravel({
    enabled: true,
    now: '2099-07-09T10:00:00+09:00',
    target_month: '2099-07'
  });
  if (!created.ok || !created.effective || created.effective.target_month !== '2099-07') {
    throw new Error('PDD001_TIME_TRAVEL_CREATE_FAILED');
  }
  checks.push('CREATE');

  var updated = app.saveTimeTravel({
    enabled: true,
    now: '2099-07-10T10:00:00+09:00',
    target_month: '2099-08'
  });
  if (!updated.ok || !updated.effective || updated.effective.target_month !== '2099-08') {
    throw new Error('PDD001_TIME_TRAVEL_UPDATE_FAILED');
  }
  checks.push('UPDATE');

  var reread = app.getTimeTravel();
  if (!reread || reread.target_month !== '2099-08') throw new Error('PDD001_TIME_TRAVEL_READ_AGAIN_FAILED');
  checks.push('READ_AGAIN');

  var disabled = app.saveTimeTravel({ enabled: false });
  if (!disabled.ok || !disabled.effective || disabled.effective.time_travel_enabled) {
    throw new Error('PDD001_TIME_TRAVEL_DISABLE_FAILED');
  }
  checks.push('DISABLE');

  // Intentionally do not restore/delete rows: the resulting physical Setting state is part of PDD001 observation.
  var physical = sheet.getDataRange().getValues();
  var result = {
    ok: true,
    message: 'PDD001 TIME TRAVEL REAL SETTING PASS',
    sheet: settingSheetName,
    success: checks.length,
    checks: checks,
    physical: physical
  };
  console.log(JSON.stringify(result));
  return result;
}
