'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertRealMigrationTarget, ALLOWED_MEMBER_ID, COLLECTION } = require('./apply-member-firestore-migration-real.cjs');
const validProfile = { target:'dev-firebase', mode:'development', projectId:'dojo-management-dev', confirmedDevelopmentProject:'dojo-management-dev' };

test('real migration entry is locked to the development proof document', () => {
  assert.equal(ALLOWED_MEMBER_ID, 'TEST_MEMBER_001');
  assert.equal(COLLECTION, 'members');
  assert.doesNotThrow(() => assertRealMigrationTarget('TEST_MEMBER_001', validProfile));
});
test('real migration entry rejects any other Member document', () => {
  assert.throws(() => assertRealMigrationTarget('MEMBER_999', validProfile), /REAL_MEMBER_MIGRATION_TEST_MEMBER_ONLY/);
});
test('real migration entry rejects any non-development target', () => {
  assert.throws(() => assertRealMigrationTarget('TEST_MEMBER_001', {...validProfile,target:'prod-firebase',mode:'production',projectId:'dojo-management-prod',confirmedDevelopmentProject:'dojo-management-prod'}), /REAL_MEMBER_MIGRATION_DEV_TARGET_REQUIRED/);
});
