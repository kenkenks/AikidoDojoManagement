'use strict';
// Generated from schema/Setting.yml by tools/build-portable-data-definition.mjs. Do not edit.
function dojoPddEnsureSettingGas_(spreadsheet) {
  var ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "99_設定";
  var expectedHeaders = ["key","value"];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    return { created: true, sheet: sheetName, headers: expectedHeaders.slice() };
  }
  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) throw new Error('PDD_STRUCTURE_MISMATCH: ' + sheetName + ' has no headers');
  var actualHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) { return String(value).trim(); });
  if (actualHeaders.length !== expectedHeaders.length || actualHeaders.some(function(value, index) { return value !== expectedHeaders[index]; })) {
    throw new Error('PDD_STRUCTURE_MISMATCH: ' + sheetName + ' expected [' + expectedHeaders.join(',') + '] actual [' + actualHeaders.join(',') + ']');
  }
  return { created: false, sheet: sheetName, headers: expectedHeaders.slice() };
}
