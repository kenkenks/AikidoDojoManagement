'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createFirestoreCore } = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');
const { settingSeed } = require('../shared/Seed_Setting.js');
const { renderFirestoreSchema, renderFirestoreDocuments, verifyFirestoreDocuments } = require('../shared/Schema_Renderer_Firestore.js');

const root = path.resolve(__dirname, '..');
const profile = JSON.parse(fs.readFileSync(path.join(root, 'targets', 'dev-firebase.json'), 'utf8').replace(/^\uFEFF/, ''));

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
  const schema = renderFirestoreSchema(settingDefinition);
  const documents = renderFirestoreDocuments(schema, settingSeed);
  const core = createFirestoreCore(profile, { getAccessToken });
  const source = { collection: schema.collection };
  const created = [];
  const existing = [];

  for (const document of documents) {
    const current = await core.readById(source, document.id);
    if (current !== null) {
      existing.push(document.id);
      continue;
    }
    await core.upsertByKey(source, document.id, document.fields);
    created.push(document.id);
  }

  const actual = [];
  for (const document of documents) {
    const fields = await core.readById(source, document.id);
    if (fields === null) throw new Error(`PDD001_SEED_READBACK_MISSING: ${document.id}`);
    actual.push({ id: document.id, fields });
  }

  const verification = verifyFirestoreDocuments(schema, actual);
  if (!verification.ok) throw new Error(`PDD001_SEED_VERIFY_FAILED: ${JSON.stringify(verification.errors)}`);

  process.stdout.write(JSON.stringify({
    ok: true,
    entity: schema.entity,
    collection: schema.collection,
    seed: { total: documents.length, created, existing },
    errors: verification.errors
  }, null, 2) + '\n');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
