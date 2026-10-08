'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildRenderedMember } = require('./dry-run-member-gas-to-firestore.cjs');
const { verifyFirestoreDocuments, restoreFirestoreRecord } = require('../shared/Schema_Renderer_Firestore.js');
const { createFirestoreCore } = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const { assertTarget } = require('./verify-member-firestore-real-roundtrip.cjs');

const COLLECTION = 'member_pdd_interface_checks';
const PROFILE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'targets', 'dev-firebase.json'), 'utf8'));
const DOCUMENT_ID = 'TEST_MEMBER_PDD_20261008_001';

function syntheticMember(id = DOCUMENT_ID) {
  return {
    member_id: id, member_name: 'Synthetic Test', member_name_kana: 'TEST',
    member_type: 'member', status: 'active', billing_group_id: 'BG_TEST',
    joined_date: '2026-01-01', withdrawn_date: '', suspension_start_month: '',
    suspension_end_month: '', birth_date: '2000-01-01', insurance_type: 'test',
    email: 'nobody@example.invalid', phone: '000', remarks: 'synthetic-only',
    current_rank: 'test', rank_source: 'test', rank_updated_at: '2026-01-01',
    rank_start_date: '', carried_training_count: 3, eligible_training_count: 1
  };
}

async function run({ profile = PROFILE, documentId, core } = {}) {
  assertTarget(profile);
  if (typeof documentId !== 'string' || !/^TEST_MEMBER_PDD_[A-Za-z0-9_-]{8,80}$/.test(documentId)) {
    throw new Error('EXPLICIT_MEMBER_PDD_TEST_ID_REQUIRED');
  }
  const built = await buildRenderedMember({ member: syntheticMember(documentId) });
  if (!built.verification.ok || built.schema.fields.length !== 21 || built.fieldCount !== 21 || built.documents.length !== 1) {
    throw new Error('MEMBER_PDD_21_FIELD_CONTRACT_FAILED');
  }
  const doc = built.documents[0];
  assert.equal(doc.id, documentId);
  const keyFields = built.schema.fields.filter(field => field.documentId);
  assert.equal(keyFields.length, 1);
  const expectedPhysicalFields = built.schema.fields.filter(field => !field.documentId);
  assert.deepEqual(Object.keys(doc.fields).sort(), expectedPhysicalFields.map(field => field.physicalName).sort());
  // Never use the PDD's production 'members' collection for this verification.
  const source = { collection: COLLECTION };
  const dao = core || createFirestoreCore(profile, { getAccessToken: async () => {
    const token = process.env.FIRESTORE_DEV_ACCESS_TOKEN;
    if (!token || !token.trim()) throw new Error('FIRESTORE_DEV_ACCESS_TOKEN_REQUIRED');
    return token.trim();
  }});
  if (await dao.readById(source, documentId) !== null) throw new Error('TEST_DOCUMENT_ALREADY_EXISTS');
  await dao.append(source, documentId, doc.fields);
  const readBack = await dao.readById(source, documentId);
  assert.deepEqual(readBack, doc.fields);
  const verified = verifyFirestoreDocuments(built.schema, [{ id: doc.id, fields: readBack }]);
  assert.equal(verified.ok, true);
  const restored = restoreFirestoreRecord(built.schema, { id: documentId, fields: readBack });
  assert.deepEqual(restored, syntheticMember(documentId));
  return { ok: true, projectId: profile.projectId, collection: COLLECTION, documentId,
    logical_fields_before: Object.keys(syntheticMember(documentId)).length,
    document_id_field: keyFields[0].logicalName,
    stored_fields: Object.keys(doc.fields).length,
    logical_fields_after: Object.keys(restored).length,
    physical_roundtrip_match: true, logical_roundtrip_match: true, writes: 1 };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node work/verify-member-pdd-firestore-roundtrip.cjs --confirm-test-id TEST_MEMBER_PDD_<unique-suffix>');
    console.log('Writes one synthetic Member document to isolated dev collection; no cleanup. Never writes to members.');
  } else if (args.length !== 2 || args[0] !== '--confirm-test-id') {
    console.error('EXPLICIT_MEMBER_PDD_TEST_ID_REQUIRED'); process.exitCode = 2;
  } else {
    run({ documentId: args[1] }).then(result => console.log(JSON.stringify(result)))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
module.exports = { run, syntheticMember, COLLECTION };
