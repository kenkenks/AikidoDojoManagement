'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planMemberFirestoreMigration } = require('./plan-member-firestore-migration.cjs');

test('LEGACY_OBSERVED is planned as sparse migration without duplicating member_id in body', () => {
  const source = {
    member_id: 'TEST_MEMBER_001',
    name: '架空の開発会員',
    status: '有効'
  };
  const before = structuredClone(source);

  assert.deepEqual(planMemberFirestoreMigration(source), {
    action: 'MIGRATE',
    schemaState: 'LEGACY_OBSERVED',
    documentId: 'TEST_MEMBER_001',
    fields: {
      member_name: '架空の開発会員',
      status: '有効'
    }
  });
  assert.deepEqual(source, before);
});

test('AFTER_COMPATIBLE sparse document is a no-op', () => {
  assert.deepEqual(planMemberFirestoreMigration({
    member_name: '架空の開発会員',
    status: '有効'
  }), {
    action: 'NO_OP',
    schemaState: 'AFTER_COMPATIBLE'
  });
});

test('MISMATCH is rejected without attempting conversion', () => {
  assert.deepEqual(planMemberFirestoreMigration({
    member_id: 'M001',
    name: '旧名',
    member_name: '新名',
    status: '有効'
  }), {
    action: 'REJECT',
    schemaState: 'MISMATCH',
    reason: 'SCHEMA_MISMATCH'
  });
});
