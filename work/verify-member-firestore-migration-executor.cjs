'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeMemberFirestoreMigration } = require('./execute-member-firestore-migration.cjs');

function memoryCore(initial) {
  let stored = initial === null ? null : structuredClone(initial);
  const calls = { read: 0, replace: 0 };
  return {
    calls,
    async readById() {
      calls.read += 1;
      return stored === null ? null : structuredClone(stored);
    },
    async replaceByKey(_source, _id, fields) {
      calls.replace += 1;
      if (stored === null) return { found: false };
      stored = structuredClone(fields);
      return { found: true };
    }
  };
}

test('LEGACY_OBSERVED migrates once, post-checks, then becomes idempotent NO_OP', async () => {
  const core = memoryCore({
    member_id: 'TEST_MEMBER_001',
    name: '架空の開発会員',
    status: '有効'
  });
  const source = { collection: 'members' };

  const first = await executeMemberFirestoreMigration(core, source, 'TEST_MEMBER_001');
  assert.deepEqual(first, {
    ok: true,
    action: 'MIGRATE',
    schemaState: 'LEGACY_OBSERVED',
    afterState: 'AFTER_COMPATIBLE',
    documentId: 'TEST_MEMBER_001',
    fields: {
      member_name: '架空の開発会員',
      status: '有効'
    }
  });
  assert.deepEqual(core.calls, { read: 2, replace: 1 });

  const second = await executeMemberFirestoreMigration(core, source, 'TEST_MEMBER_001');
  assert.deepEqual(second, {
    ok: true,
    action: 'NO_OP',
    schemaState: 'AFTER_COMPATIBLE',
    documentId: 'TEST_MEMBER_001'
  });
  assert.deepEqual(core.calls, { read: 3, replace: 1 });
});

test('MISMATCH rejects without write', async () => {
  const core = memoryCore({ member_id: 'M001', name: 'old', member_name: 'new', status: '有効' });
  const result = await executeMemberFirestoreMigration(core, { collection: 'members' }, 'M001');
  assert.equal(result.ok, false);
  assert.equal(result.action, 'REJECT');
  assert.equal(result.reason, 'SCHEMA_MISMATCH');
  assert.equal(core.calls.replace, 0);
});

test('document identity mismatch rejects before write', async () => {
  const core = memoryCore({ member_id: 'OTHER_MEMBER', name: 'x', status: '有効' });
  const result = await executeMemberFirestoreMigration(core, { collection: 'members' }, 'TEST_MEMBER_001');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'DOCUMENT_ID_MISMATCH');
  assert.equal(core.calls.replace, 0);
});

test('post-check failure is not reported as success', async () => {
  let reads = 0;
  const core = {
    calls: { replace: 0 },
    async readById() {
      reads += 1;
      if (reads === 1) return { member_id: 'TEST_MEMBER_001', name: 'x', status: '有効' };
      return { member_name: 'x', status: '有効', unexpected: true };
    },
    async replaceByKey() {
      this.calls.replace += 1;
      return { found: true };
    }
  };
  const result = await executeMemberFirestoreMigration(core, { collection: 'members' }, 'TEST_MEMBER_001');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'POST_CHECK_FAILED');
  assert.equal(result.afterState, 'MISMATCH');
  assert.equal(core.calls.replace, 1);
});
