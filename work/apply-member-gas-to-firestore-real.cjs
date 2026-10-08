'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createFirestoreCore } = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const { verifyFirestoreDocuments } = require('../shared/Schema_Renderer_Firestore.js');
const { buildRenderedMember, sanitizedError } = require('./dry-run-member-gas-to-firestore.cjs');

const ROOT = path.resolve(__dirname, '..');
const PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'targets', 'dev-firebase.json'), 'utf8'));

function assertDevFirebaseTarget(profile = PROFILE) {
  if (profile.target !== 'dev-firebase' ||
      profile.mode !== 'development' ||
      profile.projectId !== 'dojo-management-dev' ||
      profile.confirmedDevelopmentProject !== 'dojo-management-dev') {
    throw new Error('REAL_MEMBER_GAS_WRITE_DEV_TARGET_REQUIRED');
  }
}

async function getAccessToken() {
  const explicit = process.env.FIRESTORE_DEV_ACCESS_TOKEN;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() });
    const token = await admin.app().options.credential.getAccessToken();
    if (typeof token?.access_token === 'string' && token.access_token.trim()) return token.access_token.trim();
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw new Error(`FIRESTORE_ADC_FAILED: ${error?.message || error}`);
  }
  throw new Error('FIRESTORE_AUTH_REQUIRED: set FIRESTORE_DEV_ACCESS_TOKEN or configure firebase-admin Application Default Credentials');
}

function assertCoreWritableFields(document) {
  for (const value of Object.values(document.fields)) {
    if (typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number' && Number.isFinite(value) &&
        (!Number.isInteger(value) || Number.isSafeInteger(value))) continue;
    throw new Error('REAL_MEMBER_GAS_WRITE_UNSUPPORTED_VALUE');
  }
}

async function apply(options = {}) {
  const profile = options.profile || PROFILE;
  assertDevFirebaseTarget(profile);
  const built = options.built || await buildRenderedMember(options);
  if (!built.verification.ok || built.documents.length !== 1) throw new Error('REAL_MEMBER_GAS_RENDER_REQUIRED');
  const document = built.documents[0];
  assertCoreWritableFields(document);

  const core = options.core || createFirestoreCore(profile, { getAccessToken });
  const source = { collection: built.schema.collection };
  if (options.confirmDocumentId !== document.id) throw new Error('REAL_MEMBER_GAS_CONFIRM_DOCUMENT_ID_REQUIRED');
  const before = await core.readById(source, document.id);
  let writeMode;
  if (before === null) {
    await core.append(source, document.id, document.fields);
    writeMode = 'append';
  } else {
    if (options.allowReplace !== true) throw new Error('REAL_MEMBER_GAS_EXISTING_DOCUMENT_REPLACE_BLOCKED');
    await core.replaceByKey(source, document.id, document.fields);
    writeMode = 'replace';
  }

  const after = await core.readById(source, document.id);
  if (after === null) throw new Error('REAL_MEMBER_GAS_READ_BACK_NOT_FOUND');
  assert.deepEqual(after, document.fields);
  const verification = verifyFirestoreDocuments(built.schema, [{ id: document.id, fields: after }]);
  if (!verification.ok) throw new Error('REAL_MEMBER_GAS_READ_BACK_VERIFY_FAILED');

  return {
    ok: true,
    diagnostic: 'MEMBER_GAS_TO_FIRESTORE_REAL_WRITE',
    projectId: profile.projectId,
    collection: built.schema.collection,
    write_mode: writeMode,
    read_back: true,
    verification_errors: [],
    writes: 1
  };
}

if (require.main === module) {
  if (process.argv.includes('--help')) {
    process.stdout.write('Usage: node work/apply-member-gas-to-firestore-real.cjs --confirm-document-id <ID> [--allow-replace]\nNo write occurs with --help.\n');
    process.exit(0);
  }
  const idx = process.argv.indexOf('--confirm-document-id');
  const confirmDocumentId = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!confirmDocumentId || confirmDocumentId.startsWith('--')) {
    process.stderr.write('REAL_MEMBER_GAS_CONFIRM_DOCUMENT_ID_REQUIRED\n');
    process.exit(2);
  }
  apply({ confirmDocumentId, allowReplace: process.argv.includes('--allow-replace') }).then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      diagnostic: 'MEMBER_GAS_TO_FIRESTORE_REAL_WRITE',
      first_error: sanitizedError(error),
      writes: 0
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { apply, assertDevFirebaseTarget, assertCoreWritableFields };
