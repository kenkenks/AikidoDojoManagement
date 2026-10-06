// Member migration state runner.
// Read-only: inspect 01_会員マスタ and classify its physical headers against
// the generated Member migration definition. No sheet mutation belongs here.
function pddMemberHeadersEqual_(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
  for (var i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

function pddMemberMigrationState_(headers, definition) {
  if (!definition || definition.entity !== 'member' || definition.source !== 'gas') {
    throw new Error('PDD_MEMBER_MIGRATION_DEFINITION_INVALID');
  }
  if (pddMemberHeadersEqual_(headers, definition.beforeHeaders)) return 'BEFORE';
  if (pddMemberHeadersEqual_(headers, definition.afterHeaders)) return 'AFTER';
  return 'MISMATCH';
}

function runner_pdd_memberBefore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var definition = dojoPddDescribeMemberMigration_();
  var sheetName = definition.sheet;
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

  var state = pddMemberMigrationState_(headers, definition);
  var result = {
    entity: 'member',
    source: 'gas',
    sheet: sheetName,
    headers: headers,
    state: state,
    migration_ready: state === 'BEFORE',
    already_migrated: state === 'AFTER',
    changed: false
  };
  console.log(JSON.stringify(result));
  return result;
}
