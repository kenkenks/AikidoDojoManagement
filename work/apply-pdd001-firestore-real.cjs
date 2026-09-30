'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createFirestoreCore } = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');
const { renderFirestoreSchema, renderFirestoreDocuments, verifyFirestoreDocuments } = require('../shared/Schema_Renderer_Firestore.js');

const root = path.resolve(__dirname, '..');
const profile = JSON.parse(fs.readFileSync(path.join(root, 'targets', 'dev-firebase.json'), 'utf8'));

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

async function main() {
  const [inputFile, ...extra] = process.argv.slice(2);
  if (!inputFile || extra.length) throw new Error('Usage: node work/apply-pdd001-firestore-real.cjs <input.json>');

  const inputText = fs.readFileSync(path.resolve(inputFile), 'utf8').replace(/^\uFEFF/, '');
  const records = JSON.parse(inputText);
  const schema = renderFirestoreSchema(settingDefinition);
  const inputRecords = Array.isArray(records) ? records : [records];
  const documents = renderFirestoreDocuments(schema, inputRecords);

  if (documents.length !== 1 || documents[0].id !== 'PDD001_RENDERER_TEST') {
    throw new Error('PDD001_REAL_APPLY_REQUIRES_TEST_KEY: PDD001_RENDERER_TEST');
  }

  const core = createFirestoreCore(profile, { getAccessToken });
  const source = { collection: schema.collection };

  for (const document of documents) {
    await core.upsertByKey(source, document.id, document.fields);
  }

  const document = documents[0];
  const stored = await core.readById(source, document.id);
  if (stored === null) {
    throw new Error(`PDD001_REAL_APPLY_READBACK_MISSING: ${document.id}`);
  }

  const verification = verifyFirestoreDocuments(schema, [{
    id: document.id,
    fields: stored
  }]);

  if (!verification.ok) {
    throw new Error(`PDD001_REAL_APPLY_VERIFY_FAILED: ${JSON.stringify(verification.errors)}`);
  }

  process.stdout.write(JSON.stringify({
    ...verification,
    operation: 'upsert-read-verify',
    documentId: document.id,
    fields: stored
  }, null, 2) + '\n');
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
