'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AFTER_FIELDS,
  classifyMemberFirestoreSchema
} = require('./classify-member-firestore-schema.cjs');

function afterDocument() {
  return Object.fromEntries(AFTER_FIELDS.map((field) => [field, '']));
}

test('observed TEST_MEMBER_001 legacy shape is classified explicitly', () => {
  assert.equal(classifyMemberFirestoreSchema({
    status: '有効',
    name: '架空の開発会員',
    member_id: 'TEST_MEMBER_001'
  }), 'LEGACY_OBSERVED');
});

test('exact migrated 21-field shape is AFTER_COMPATIBLE', () => {
  assert.equal(classifyMemberFirestoreSchema(afterDocument()), 'AFTER_COMPATIBLE');
});

test('unknown, partial, or extended shapes fail closed as MISMATCH', () => {
  assert.equal(classifyMemberFirestoreSchema({ member_id: 'M001', status: '有効' }), 'MISMATCH');
  assert.equal(classifyMemberFirestoreSchema({ ...afterDocument(), unexpected: true }), 'MISMATCH');
  assert.equal(classifyMemberFirestoreSchema({ member_id: 'M001', name: 'x', status: '有効', extra: 'x' }), 'MISMATCH');
});
