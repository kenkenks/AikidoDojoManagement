'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { run, syntheticMember, COLLECTION } = require('./verify-member-pdd-firestore-roundtrip.cjs');
const { restoreFirestoreRecord } = require('../shared/Schema_Renderer_Firestore.js');
const ID = 'TEST_MEMBER_PDD_20261008_001';

test('synthetic Member uses 21 PDD fields and isolated collection', async () => {
  const calls = [];
  let saved = null;
  const core = {
    async readById(source, id) { calls.push('read'); assert.equal(source.collection, COLLECTION); assert.equal(id, ID); return saved; },
    async append(source, id, fields) { calls.push('append'); assert.equal(source.collection, COLLECTION); assert.equal(id, ID); saved = { ...fields }; }
  };
  const result = await run({ documentId: ID, core });
  assert.equal(result.ok, true);
  assert.equal(result.logical_fields_before, 21);
  assert.equal(result.document_id_field, 'member_id');
  assert.equal(result.logical_fields_after, 21);
  assert.equal(result.logical_roundtrip_match, true);
  assert.equal(result.stored_fields, 20);
  assert.deepEqual(calls, ['read', 'append', 'read']);
  assert.equal(saved.carried_training_count, 3);
  assert.equal(saved.eligible_training_count, 1);
  assert.equal(Object.hasOwn(saved, 'member_id'), false);
});

test('existing ID is rejected without writes', async () => {
  let writes = 0;
  const core = { async readById() { return { existing: true }; }, async append() { writes++; } };
  await assert.rejects(run({ documentId: ID, core }), /TEST_DOCUMENT_ALREADY_EXISTS/);
  assert.equal(writes, 0);
});

test('invalid ID is rejected before DAO access', async () => {
  let calls = 0;
  const core = { async readById() { calls++; } };
  await assert.rejects(run({ documentId: 'M_REAL', core }), /EXPLICIT_MEMBER_PDD_TEST_ID_REQUIRED/);
  assert.equal(calls, 0);
  assert.equal(Object.keys(syntheticMember(ID)).length, 21);
});

test('restoration permits omitted optional field but rejects unknown physical field', async () => {
  const { buildRenderedMember } = require('./dry-run-member-gas-to-firestore.cjs');
  const built = await buildRenderedMember({ member: syntheticMember(ID) });
  const doc = built.documents[0];
  const field = built.schema.fields.find(f => !f.documentId && !f.required);
  assert.ok(field);
  const missing = { ...doc.fields };
  delete missing[field.physicalName];
  const restored = restoreFirestoreRecord(built.schema, { id: doc.id, fields: missing });
  assert.equal(Object.hasOwn(restored, field.logicalName), false);
  assert.throws(() => restoreFirestoreRecord(built.schema, { id: doc.id, fields: { ...doc.fields, unexpected_field: 'x' } }), /UNMAPPED_PHYSICAL_FIELD/);
});

test('restoration rejects type mismatch', async () => {
  const { buildRenderedMember } = require('./dry-run-member-gas-to-firestore.cjs');
  const built = await buildRenderedMember({ member: syntheticMember(ID) });
  const doc = built.documents[0];
  assert.throws(() => restoreFirestoreRecord(built.schema, { id: doc.id, fields: { ...doc.fields, carried_training_count: '3' } }), /TYPE_MISMATCH/);
});
