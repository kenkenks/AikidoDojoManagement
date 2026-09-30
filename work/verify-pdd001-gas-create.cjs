const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadEnsure() {
  cp.execFileSync(process.execPath, ['tools/build-portable-data-definition.mjs'], { cwd: root, stdio: 'pipe' });
  const source = fs.readFileSync(path.join(root, 'gas/DojoPddCreateSetting.generated.js'), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.dojoPddEnsureSettingGas_;
}

function spreadsheet(initial) {
  const sheets = new Map();
  function makeSheet(name, rows = []) {
    const data = rows.map(row => row.slice());
    return {
      name,
      data,
      getLastColumn() { return data[0] ? data[0].length : 0; },
      getRange(row, column, numRows, numColumns) {
        return {
          getValues() {
            return Array.from({length:numRows}, (_,r) => Array.from({length:numColumns}, (_,c) => data[row-1+r]?.[column-1+c] ?? ''));
          },
          setValues(values) {
            for (let r=0;r<numRows;r++) {
              data[row-1+r] ||= [];
              for (let c=0;c<numColumns;c++) data[row-1+r][column-1+c] = values[r][c];
            }
            return this;
          }
        };
      }
    };
  }
  for (const [name, rows] of Object.entries(initial || {})) sheets.set(name, makeSheet(name, rows));
  return {
    sheets,
    getSheetByName(name) { return sheets.get(name) || null; },
    insertSheet(name) { const sheet = makeSheet(name); sheets.set(name, sheet); return sheet; }
  };
}

test('PDD001 GAS Create creates missing Setting sheet from Definition', () => {
  const ensure = loadEnsure();
  const ss = spreadsheet();
  const result = ensure(ss);
  assert.equal(result.created, true);
  assert.deepEqual(ss.getSheetByName('99_設定').data[0], ['key','value']);
});

test('PDD001 GAS Create is idempotent and preserves existing Setting data', () => {
  const ensure = loadEnsure();
  const ss = spreadsheet({'99_設定': [['key','value'], ['TIME_TRAVEL_ENABLED','TRUE']]});
  const before = JSON.stringify(ss.getSheetByName('99_設定').data);
  const result = ensure(ss);
  assert.equal(result.created, false);
  assert.equal(JSON.stringify(ss.getSheetByName('99_設定').data), before);
});

test('PDD001 GAS Create refuses structural mismatch instead of migrating it', () => {
  const ensure = loadEnsure();
  const ss = spreadsheet({'99_設定': [['key','wrong'], ['TIME_TRAVEL_ENABLED','TRUE']]});
  assert.throws(() => ensure(ss), /PDD_STRUCTURE_MISMATCH/);
  assert.deepEqual(ss.getSheetByName('99_設定').data[0], ['key','wrong']);
});
