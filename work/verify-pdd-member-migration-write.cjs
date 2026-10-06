'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const runnerSource = fs.readFileSync(path.join(root, 'gas/28_PddMemberMigrationRunner.js'), 'utf8');
const generatedSource = fs.readFileSync(path.join(root, 'gas/DojoPddMigrateMember.generated.js'), 'utf8');

function makeContext(initialHeaders, dataRows) {
  let headers = Array.from(initialHeaders);
  const rows = dataRows.map(row => Array.from(row));
  let headerWrites = 0;
  const sheet = {
    getLastColumn() { return headers.length; },
    getLastRow() { return rows.length + 1; },
    getRange(row, column, numRows, numColumns) {
      assert.equal(column, 1);
      assert.equal(numColumns, headers.length);
      if (row === 1) {
        assert.equal(numRows, 1);
        return {
          getValues() { return [Array.from(headers)]; },
          setValues(values) {
            assert.equal(values.length, 1);
            headers = Array.from(values[0]);
            headerWrites += 1;
          }
        };
      }
      assert.equal(row, 2);
      assert.equal(numRows, rows.length);
      return { getValues() { return rows.map(item => Array.from(item)); } };
    }
  };
  const context = {
    console: { log() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet() { return { getSheetByName() { return sheet; } }; },
      flush() {}
    }
  };
  vm.createContext(context);
  vm.runInContext(generatedSource, context);
  vm.runInContext(runnerSource, context);
  return { context, getHeaders: () => headers, getHeaderWrites: () => headerWrites };
}

function definition() {
  const context = { console: { log() {} } };
  vm.createContext(context);
  vm.runInContext(generatedSource, context);
  return context.dojoPddDescribeMemberMigration_();
}

test('Member header migration changes only exact BEFORE to AFTER', () => {
  const def = definition();
  const fixture = makeContext(def.beforeHeaders, [['M001', 'Alice'], ['M002', 'Bob']]);
  const result = fixture.context.runner_pdd_memberMigrateHeaders();
  assert.deepEqual(Array.from(fixture.getHeaders()), Array.from(def.afterHeaders));
  assert.equal(fixture.getHeaderWrites(), 1);
  assert.equal(result.state_before, 'BEFORE');
  assert.equal(result.state_after, 'AFTER');
  assert.equal(result.changed, true);
  assert.equal(result.data_rows_unchanged, true);
});

test('Member header migration is idempotent for AFTER', () => {
  const def = definition();
  const fixture = makeContext(def.afterHeaders, [['M001', 'Alice']]);
  const result = fixture.context.runner_pdd_memberMigrateHeaders();
  assert.equal(fixture.getHeaderWrites(), 0);
  assert.equal(result.already_migrated, true);
  assert.equal(result.changed, false);
});

test('Member header migration refuses MISMATCH without writing', () => {
  const def = definition();
  const mismatch = Array.from(def.beforeHeaders);
  mismatch[1] = def.afterHeaders[1];
  const fixture = makeContext(mismatch, [['M001', 'Alice']]);
  assert.throws(() => fixture.context.runner_pdd_memberMigrateHeaders(), /PDD_MEMBER_MIGRATION_NOT_READY/);
  assert.equal(fixture.getHeaderWrites(), 0);
});

test('Member header migration refuses column count mismatch without writing', () => {
  const def = definition();
  const fixture = makeContext(def.beforeHeaders.slice(0, -1), [['M001', 'Alice']]);
  assert.throws(() => fixture.context.runner_pdd_memberMigrateHeaders(), /PDD_MEMBER_MIGRATION_COLUMN_MISMATCH/);
  assert.equal(fixture.getHeaderWrites(), 0);
});

test('Member migration write surface is limited to one header setValues call in implementation', () => {
  const matches = runnerSource.match(/\.setValues\s*\(/g) || [];
  assert.equal(matches.length, 1);
  assert.match(runnerSource, /headerRange\.setValues\(\[definition\.afterHeaders\]\)/);
  assert.doesNotMatch(runnerSource, /\.insert(?:Column|Columns|Row|Rows)/);
  assert.doesNotMatch(runnerSource, /\.delete(?:Column|Columns|Row|Rows)/);
});
