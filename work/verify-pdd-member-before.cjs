'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('gas/28_PddMemberMigrationRunner.js', 'utf8');

function run(rows, options = {}) {
  const logs = [];
  const sheet = rows === null ? null : {
    getLastColumn() { return rows[0] ? rows[0].length : 0; },
    getRange(row, column, height, width) {
      assert.equal(row, 1);
      assert.equal(column, 1);
      assert.equal(height, 1);
      return {
        getValues() { return [rows[0].slice(0, width)]; }
      };
    }
  };
  const context = {
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return { getSheetByName(name) {
          assert.equal(name, '01_会員マスタ');
          return sheet;
        }};
      }
    },
    console: { log(value) { logs.push(value); } }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { result: context.runner_pdd_memberBefore(), logs };
}

test('Member Before captures real physical headers without changing them', () => {
  const { result, logs } = run([['member_id', '氏名', '状態']]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    entity: 'member',
    source: 'gas',
    sheet: '01_会員マスタ',
    headers: ['member_id', '氏名', '状態'],
    changed: false
  });
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), JSON.parse(JSON.stringify(result)));
});

test('Member Before refuses missing member sheet', () => {
  assert.throws(() => run(null), /PDD_MEMBER_BEFORE_MISSING: 01_会員マスタ/);
});

test('Member Before refuses empty headers inside the physical definition', () => {
  assert.throws(() => run([['member_id', '', '状態']]), /PDD_MEMBER_BEFORE_EMPTY_HEADER/);
});

test('Member Before refuses duplicate physical headers', () => {
  assert.throws(() => run([['member_id', '氏名', '氏名']]), /PDD_MEMBER_BEFORE_DUPLICATE_HEADER/);
});
