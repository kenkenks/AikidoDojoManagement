// PDD001 real-contact runner.
// First contact is intentionally read-only: never create or rewrite 99_設定 here.
function runner_pdd001_settingRealContact() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var description = dojoPddDescribeSettingGas_();
  var sheetName = description.sheet;
  var expectedHeaders = description.requiredHeaders;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('PDD_REAL_CONTACT_MISSING: ' + sheetName);

  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) throw new Error('PDD_STRUCTURE_MISMATCH: ' + sheetName + ' has no headers');
  var actualHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value).trim();
  });
  var missingHeaders = expectedHeaders.filter(function(expected) {
    return actualHeaders.indexOf(expected) < 0;
  });
  if (missingHeaders.length) {
    throw new Error('PDD_STRUCTURE_MISMATCH: ' + sheetName + ' required [' + expectedHeaders.join(',') + '] actual [' + actualHeaders.join(',') + '] missing [' + missingHeaders.join(',') + ']');
  }

  var beforeLastRow = sheet.getLastRow();
  var ensureResult = dojoPddEnsureSettingGas_(ss);
  var afterLastRow = sheet.getLastRow();
  if (ensureResult.created !== false) throw new Error('PDD_REAL_CONTACT_UNEXPECTED_CREATE');
  if (beforeLastRow !== afterLastRow) throw new Error('PDD_REAL_CONTACT_ROW_CHANGED');

  var result = {
    ok: true,
    message: 'PDD001 SETTING REAL CONTACT PASS',
    sheet: sheetName,
    headers: expectedHeaders.slice(),
    rows: afterLastRow,
    changed: false
  };
  console.log(JSON.stringify(result));
  return result;
}
