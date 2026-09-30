// PDD001 real-create runner.
// This runner is explicitly allowed to create 99_設定 when it is missing.
// Existing sheets are only validated; existing rows are never rewritten here.
function runner_pdd001_settingRealCreate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var description = dojoPddDescribeSettingGas_();
  var beforeSheet = ss.getSheetByName(description.sheet);
  var beforeRows = beforeSheet ? beforeSheet.getLastRow() : 0;

  var ensureResult = dojoPddEnsureSettingGas_(ss);
  var sheet = ss.getSheetByName(description.sheet);
  if (!sheet) throw new Error('PDD_REAL_CREATE_FAILED: ' + description.sheet);

  var afterRows = sheet.getLastRow();
  if (beforeSheet && beforeRows !== afterRows) throw new Error('PDD_REAL_CREATE_EXISTING_ROWS_CHANGED');

  var result = {
    ok: true,
    message: 'PDD001 SETTING REAL CREATE PASS',
    sheet: ensureResult.sheet,
    headers: ensureResult.headers.slice(),
    created: ensureResult.created === true,
    rows: afterRows,
    changed: ensureResult.created === true
  };
  console.log(JSON.stringify(result));
  return result;
}
