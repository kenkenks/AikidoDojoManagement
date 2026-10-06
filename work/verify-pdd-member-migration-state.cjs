'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const runnerSource = fs.readFileSync(path.join(root, 'gas/28_PddMemberMigrationRunner.js'), 'utf8');
const generatedSource = fs.readFileSync(path.join(root, 'gas/DojoPddMigrateMember.generated.js'), 'utf8');

function loadContext() {
  const context = { console: { log() {} } };
  vm.createContext(context);
  vm.runInContext(generatedSource, context);
  vm.runInContext(runnerSource, context);
  return context;
}

test('Member migration state is BEFORE for exact Before headers', () => {
  const context = loadContext();
  const definition = context.dojoPddDescribeMemberMigration_();
  assert.equal(context.pddMemberMigrationState_(definition.beforeHeaders, definition), 'BEFORE');
});

test('Member migration state is AFTER for exact After headers', () => {
  const context = loadContext();
  const definition = context.dojoPddDescribeMemberMigration_();
  assert.equal(context.pddMemberMigrationState_(definition.afterHeaders, definition), 'AFTER');
});

test('Member migration state is MISMATCH for partial migration', () => {
  const context = loadContext();
  const definition = context.dojoPddDescribeMemberMigration_();
  const headers = Array.from(definition.beforeHeaders);
  headers[1] = definition.afterHeaders[1];
  assert.equal(context.pddMemberMigrationState_(headers, definition), 'MISMATCH');
});

test('Member migration state is MISMATCH for column count mismatch', () => {
  const context = loadContext();
  const definition = context.dojoPddDescribeMemberMigration_();
  assert.equal(context.pddMemberMigrationState_(definition.beforeHeaders.slice(0, -1), definition), 'MISMATCH');
});

test('Member migration observation runner remains read-only', () => {
  const match = runnerSource.match(/function\s+runner_pdd_memberBefore\s*\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, 'runner_pdd_memberBefore must exist');
  const observationRunnerSource = match[0];
  assert.doesNotMatch(observationRunnerSource, /\.setValues?\s*\(/);
  assert.doesNotMatch(observationRunnerSource, /\.insert(?:Column|Columns|Row|Rows)/);
  assert.doesNotMatch(observationRunnerSource, /\.delete(?:Column|Columns|Row|Rows)/);
  assert.match(observationRunnerSource, /changed:\s*false/);
});
