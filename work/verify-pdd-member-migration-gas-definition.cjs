'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildMemberMigrationDefinition, renderGas } = require('../tools/build-member-migration-gas.cjs');

const root = path.resolve(__dirname, '..');
const before = JSON.parse(fs.readFileSync(path.join(root, 'schema/migration/Member/Member.before.json'), 'utf8'));
const after = JSON.parse(fs.readFileSync(path.join(root, 'schema/migration/Member/Member.after.json'), 'utf8'));
const generatedPath = path.join(root, 'gas/DojoPddMigrateMember.generated.js');

function loadGeneratedDefinition() {
  const source = fs.readFileSync(generatedPath, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return JSON.parse(JSON.stringify(context.dojoPddDescribeMemberMigration_()));
}

test('generated Member migration definition exactly reflects Before and After', () => {
  assert.deepEqual(loadGeneratedDefinition(), {
    entity: before.entity,
    source: before.source,
    sheet: before.sheet,
    beforeHeaders: before.headers,
    afterHeaders: after.headers
  });
});

test('Member migration GAS artifact is exactly reproducible from migration SSOT', () => {
  const expected = renderGas(buildMemberMigrationDefinition(before, after));
  assert.equal(fs.readFileSync(generatedPath, 'utf8'), expected);
});

test('Member migration GAS definition rejects identity mismatch', () => {
  assert.throws(
    () => buildMemberMigrationDefinition(before, { ...after, sheet: 'OTHER' }),
    /source identity mismatch/
  );
});

test('Member migration GAS definition rejects header count mismatch', () => {
  assert.throws(
    () => buildMemberMigrationDefinition(before, { ...after, headers: after.headers.slice(0, -1) }),
    /header count mismatch/
  );
});
