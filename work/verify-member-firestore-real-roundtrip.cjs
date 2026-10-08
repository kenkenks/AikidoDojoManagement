'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createFirestoreCore } = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const PROFILE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'targets', 'dev-firebase.json'), 'utf8'));
const COLLECTION = 'member_dao_roundtrip_checks';
const VALUES = Object.freeze({ sample_text: 'synthetic', sample_integer: 3, sample_decimal: 1.5, sample_boolean: true });
function assertTarget(profile) {
  if (profile.target !== 'dev-firebase' || profile.mode !== 'development' ||
      profile.projectId !== 'dojo-management-dev' ||
      profile.confirmedDevelopmentProject !== 'dojo-management-dev') throw new Error('DEV_FIRESTORE_ONLY');
}
function assertId(id) {
  if (!/^TEST_ROUNDTRIP_[A-Za-z0-9_-]{8,80}$/.test(id || '')) throw new Error('EXPLICIT_UNIQUE_TEST_ID_REQUIRED');
}
async function roundTrip({ profile = PROFILE, documentId, core } = {}) {
  assertTarget(profile);
  assertId(documentId);
  const dao = core || createFirestoreCore(profile, { getAccessToken: async () => {
    const token = process.env.FIRESTORE_DEV_ACCESS_TOKEN;
    if (!token || !token.trim()) throw new Error('FIRESTORE_DEV_ACCESS_TOKEN_REQUIRED');
    return token.trim();
  }});
  const source = { collection: COLLECTION };
  const before = await dao.readById(source, documentId);
  if (before !== null) throw new Error('TEST_DOCUMENT_ALREADY_EXISTS');
  await dao.append(source, documentId, VALUES);
  const after = await dao.readById(source, documentId);
  assert.deepEqual(after, VALUES);
  return { ok: true, projectId: profile.projectId, collection: COLLECTION,
    documentId, read_back: true, typed_fields_verified: Object.keys(VALUES).length, writes: 1 };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node work/verify-member-firestore-real-roundtrip.cjs --confirm-test-id TEST_ROUNDTRIP_<unique-suffix>');
    console.log('Creates one synthetic document in dojo-management-dev; refuses existing IDs; no cleanup.');
  } else if (args.length !== 2 || args[0] !== '--confirm-test-id') {
    console.error('EXPLICIT_TEST_ID_REQUIRED; run --help'); process.exitCode = 1;
  } else {
    roundTrip({ documentId: args[1] }).then(result => console.log(JSON.stringify(result)))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
module.exports = { roundTrip, assertTarget, assertId, COLLECTION, VALUES };
