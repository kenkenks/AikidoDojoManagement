// Member migration definition runner.
// First step is intentionally read-only: capture the physical header definition
// of 01_会員マスタ without creating, rewriting, or normalizing anything.
function runner_pdd_memberBefore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = '01_会員マスタ';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('PDD_MEMBER_BEFORE_MISSING: ' + sheetName);

  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) throw new Error('PDD_MEMBER_BEFORE_NO_HEADERS: ' + sheetName);

  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value).trim();
  });
  var emptyIndexes = [];
  headers.forEach(function(header, index) {
    if (!header) emptyIndexes.push(index + 1);
  });
  if (emptyIndexes.length) {
    throw new Error('PDD_MEMBER_BEFORE_EMPTY_HEADER: ' + sheetName + ' columns [' + emptyIndexes.join(',') + ']');
  }

  var duplicateHeaders = [];
  var seen = {};
  headers.forEach(function(header) {
    if (seen[header] && duplicateHeaders.indexOf(header) < 0) duplicateHeaders.push(header);
    seen[header] = true;
  });
  if (duplicateHeaders.length) {
    throw new Error('PDD_MEMBER_BEFORE_DUPLICATE_HEADER: ' + sheetName + ' [' + duplicateHeaders.join(',') + ']');
  }

  var result = {
    entity: 'member',
    source: 'gas',
    sheet: sheetName,
    headers: headers,
    changed: false
  };
  console.log(JSON.stringify(result));
  return result;
}
