'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const generated = fs.readFileSync(path.join(root, 'gas', 'DojoPddCreateSetting.generated.js'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'gas', '26_PddRealCreateRunner.js'), 'utf8');

function makeSheet(name, headers = [], rows = []) {
  const values = [headers.slice(), ...rows.map(r => r.slice())];
  return {
    name,
    getLastColumn() { return values[0]?.length || 0; },
    getLastRow() { return values.length && values[0].length ? values.length : 0; },
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          return values.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols));
        },
        setValues(input) {
          for (let r = 0; r < input.length; r++) {
            while (values.length < row + r) values.push([]);
            for (let c = 0; c < input[r].length; c++) {
              values[row - 1 + r][col - 1 + c] = input[r][c];
            }
          }
        }
      };
    },
    _values: values
  };
}

function load(sheets) {
  const byName = new Map(sheets.map(s => [s.name, s]));
  const ss = {
    getSheetByName(name) { return byName.get(name) || null; },
    insertSheet(name) { const sheet = makeSheet(name); byName.set(name, sheet); return sheet; }
  };
  const context = { console: { log() {} }, SpreadsheetApp: { getActiveSpreadsheet() { return ss; } } };
  vm.createContext(context);
  vm.runInContext(generated + '\n' + runner, context);
  return { context, ss };
}

test('PDD001 real create creates missing Setting sheet from Definition', () => {
  const { context, ss } = load([]);
  const result = context.runner_pdd001_settingRealCreate();
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.changed, true);
  assert.deepEqual(Array.from(result.headers), ['キー', '値']);
  assert.deepEqual(ss.getSheetByName('99_設定')._values[0], ['キー', '値']);
});

test('PDD001 real create second run is idempotent', () => {
  const { context } = load([]);
  const first = context.runner_pdd001_settingRealCreate();
  const second = context.runner_pdd001_settingRealCreate();
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.changed, false);
});

test('PDD001 real create preserves existing shared Setting rows', () => {
  const sheet = makeSheet('99_設定', ['キー', '値', '備考'], [['A', '1', 'keep']]);
  const { context } = load([sheet]);
  const before = JSON.stringify(sheet._values);
  const result = context.runner_pdd001_settingRealCreate();
  assert.equal(result.created, false);
  assert.equal(result.changed, false);
  assert.equal(JSON.stringify(sheet._values), before);
});
