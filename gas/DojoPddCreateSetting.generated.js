'use strict';
// Generated from schema/Setting.yml by tools/build-portable-data-definition.mjs. Do not edit.
function dojoPddDescribeSettingGas_() {
  return { sheet: "99_設定", requiredHeaders: ["キー","値"] };
}
function dojoPddEnsureSettingGas_(spreadsheet) {
  var ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  var description = dojoPddDescribeSettingGas_();
  var sheetName = description.sheet;
  var expectedHeaders = description.requiredHeaders;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    return { created: true, sheet: sheetName, headers: expectedHeaders.slice() };
  }
  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) throw new Error('PDD_STRUCTURE_MISMATCH: ' + sheetName + ' has no headers');
  var actualHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) { return String(value).trim(); });
  var missingHeaders = expectedHeaders.filter(function(expected) { return actualHeaders.indexOf(expected) < 0; });
  if (missingHeaders.length) {
    throw new Error('PDD_STRUCTURE_MISMATCH: ' + sheetName + ' required [' + expectedHeaders.join(',') + '] actual [' + actualHeaders.join(',') + '] missing [' + missingHeaders.join(',') + ']');
  }
  return { created: false, sheet: sheetName, headers: expectedHeaders.slice() };
}
