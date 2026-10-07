'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDryRunResult } = require('./dry-run-member-firestore-migration-real.cjs');

test('legacy real shape produces a read-only MIGRATE plan', () => {
  const result = buildDryRunResult('TEST_MEMBER_001', {
    name: '架空の開発会員',
    member_id: 'TEST_MEMBER_001',
    status: '有効'
  });
  assert.deepEqual(result, {
    operation: 'read-only-dry-run',
    memberId: 'TEST_MEMBER_001',
    found: true,
    action: 'MIGRATE',
    schemaState: 'LEGACY_OBSERVED',
    documentId: 'TEST_MEMBER_001',
    fields: {
      member_name: '架空の開発会員',
      status: '有効'
    }
  });
});

test('document identity mismatch is rejected by dry-run', () => {
  const result = buildDryRunResult('TEST_MEMBER_001', {
    name: 'x',
    member_id: 'OTHER_MEMBER',
    status: '有効'
  });
  assert.equal(result.action, 'REJECT');
  assert.equal(result.reason, 'DOCUMENT_ID_MISMATCH');
  assert.equal(result.plannedDocumentId, 'OTHER_MEMBER');
});

test('AFTER_COMPATIBLE is reported as NO_OP', () => {
  const result = buildDryRunResult('TEST_MEMBER_001', {
    member_name: '架空の開発会員',
    status: '有効'
  });
  assert.equal(result.action, 'NO_OP');
  assert.equal(result.schemaState, 'AFTER_COMPATIBLE');
});

test('missing document is rejected without a migration plan', () => {
  const result = buildDryRunResult('TEST_MEMBER_001', null);
  assert.deepEqual(result, {
    operation: 'read-only-dry-run',
    memberId: 'TEST_MEMBER_001',
    found: false,
    action: 'REJECT',
    reason: 'DOCUMENT_NOT_FOUND'
  });
});
