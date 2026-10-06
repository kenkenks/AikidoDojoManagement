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

function pddMemberDataRowsEqual_(beforeRows, afterRows) {
  if (!Array.isArray(beforeRows) || !Array.isArray(afterRows) || beforeRows.length !== afterRows.length) return false;
  for (var r = 0; r < beforeRows.length; r++) {
    if (!Array.isArray(beforeRows[r]) || !Array.isArray(afterRows[r]) || beforeRows[r].length !== afterRows[r].length) return false;
    for (var c = 0; c < beforeRows[r].length; c++) {
      var beforeValue = beforeRows[r][c];
      var afterValue = afterRows[r][c];
      if (beforeValue instanceof Date && afterValue instanceof Date) {
        if (beforeValue.getTime() !== afterValue.getTime()) return false;
      } else if (beforeValue !== afterValue) {
        return false;
      }
    }
  }
  return true;
}

function runner_pdd_memberMigrateHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var definition = dojoPddDescribeMemberMigration_();
  var sheetName = definition.sheet;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('PDD_MEMBER_MIGRATION_MISSING: ' + sheetName);

  var lastColumn = sheet.getLastColumn();
  if (lastColumn !== definition.beforeHeaders.length) {
    throw new Error('PDD_MEMBER_MIGRATION_COLUMN_MISMATCH: ' + sheetName + ' expected=' + definition.beforeHeaders.length + ' actual=' + lastColumn);
  }

  var headerRange = sheet.getRange(1, 1, 1, lastColumn);
  var headers = headerRange.getValues()[0].map(function(value) {
    return String(value).trim();
  });
  var state = pddMemberMigrationState_(headers, definition);

  if (state === 'AFTER') {
    return {
      entity: 'member', source: 'gas', sheet: sheetName,
      state_before: 'AFTER', state_after: 'AFTER',
      already_migrated: true, changed: false, data_rows_unchanged: true
    };
  }
  if (state !== 'BEFORE') {
    throw new Error('PDD_MEMBER_MIGRATION_NOT_READY: ' + sheetName + ' state=' + state);
  }

  var lastRow = sheet.getLastRow();
  var dataRowsBefore = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues() : [];

  headerRange.setValues([definition.afterHeaders]);
  SpreadsheetApp.flush();

  var headersAfter = headerRange.getValues()[0].map(function(value) {
    return String(value).trim();
  });
  var stateAfter = pddMemberMigrationState_(headersAfter, definition);
  if (stateAfter !== 'AFTER') {
    throw new Error('PDD_MEMBER_MIGRATION_AFTER_VERIFY_FAILED: ' + sheetName + ' state=' + stateAfter);
  }

  var lastRowAfter = sheet.getLastRow();
  if (lastRowAfter !== lastRow) {
    throw new Error('PDD_MEMBER_MIGRATION_DATA_ROW_COUNT_CHANGED: ' + sheetName + ' before=' + lastRow + ' after=' + lastRowAfter);
  }
  var dataRowsAfter = lastRowAfter > 1 ? sheet.getRange(2, 1, lastRowAfter - 1, lastColumn).getValues() : [];
  if (!pddMemberDataRowsEqual_(dataRowsBefore, dataRowsAfter)) {
    throw new Error('PDD_MEMBER_MIGRATION_DATA_CHANGED: ' + sheetName);
  }

  var result = {
    entity: 'member', source: 'gas', sheet: sheetName,
    state_before: 'BEFORE', state_after: 'AFTER',
    already_migrated: false, changed: true, data_rows_unchanged: true
  };
  console.log(JSON.stringify(result));
  return result;
}
