const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const ensureSource = fs.readFileSync(path.join(root, 'gas/DojoPddCreateSetting.generated.js'), 'utf8');
const runnerSource = fs.readFileSync(path.join(root, 'gas/25_PddRealContactRunner.js'), 'utf8');
const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');
const settingSheetName = settingDefinition.sources.gas.sheet;

function sheet(rows) {
  const data = rows.map(row => row.slice());
  return {
    data,
    getLastColumn() { return data[0] ? data[0].length : 0; },
    getLastRow() { return data.length; },
    getRange(row, column, numRows, numColumns) {
      return {
        getValues() { return Array.from({length:numRows}, (_,r) => Array.from({length:numColumns}, (_,c) => data[row-1+r]?.[column-1+c] ?? '')); },
        setValues(values) { for (let r=0;r<numRows;r++) { data[row-1+r] ||= []; for (let c=0;c<numColumns;c++) data[row-1+r][column-1+c]=values[r][c]; } return this; }
      };
    }
  };
}
function run(rows) {
  const settingSheet = rows ? sheet(rows) : null;
  const spreadsheet = {
    getSheetByName(name) { return name === settingSheetName ? settingSheet : null; },
    insertSheet() { throw new Error('REAL_CONTACT_MUST_NOT_CREATE'); }
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    console: { log() {} }
  };
  vm.createContext(context);
  vm.runInContext(ensureSource, context);
  vm.runInContext(runnerSource, context);
  return { result: context.runner_pdd001_settingRealContact(), sheet: settingSheet };
}

test('PDD001 real contact accepts existing Setting structure without changing rows', () => {
  const rows = [['キー','値',''],['TIME_TRAVEL_ENABLED','FALSE','既存'],['DEBUG_DATE','2099-07-09T10:00:00+09:00','']];
  const before = JSON.stringify(rows);
  const { result, sheet } = run(rows);
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.rows, 3);
  assert.equal(JSON.stringify(sheet.data), before);
});

test('PDD001 real contact refuses to create a missing real Setting sheet', () => {
  assert.throws(() => run(null), /PDD_REAL_CONTACT_MISSING/);
});

test('PDD001 real contact refuses mismatched real Setting structure', () => {
  assert.throws(() => run([['キー','wrong'],['TIME_TRAVEL_ENABLED','FALSE']]), /PDD_STRUCTURE_MISMATCH/);
});
