'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { decodeFields } = require('../cloud/member-read/DAO_Core_Values.cjs');
const { firestoreEndpoint } = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');
const { renderFirestoreSchema, verifyFirestoreDocuments } = require('../shared/Schema_Renderer_Firestore.js');

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

function documentId(name, collection) {
  const marker = `/documents/${collection}/`;
  const index = name.indexOf(marker);
  if (index < 0) throw new Error('INVALID_DOCUMENT_PATH');
  const id = name.slice(index + marker.length);
  if (!id || id.includes('/')) throw new Error('INVALID_DOCUMENT_PATH');
  return decodeURIComponent(id);
}

async function readCollection(schema) {
  const token = await getAccessToken();
  const base = firestoreEndpoint(profile);
  const documents = [];
  let pageToken = '';

  do {
    const query = new URLSearchParams({ pageSize: '300' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await fetch(`${base}/${encodeURIComponent(schema.collection)}?${query}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`FIRESTORE_HTTP_${response.status}`);
    const body = await response.json();
    for (const document of body.documents || []) {
      documents.push({
        id: documentId(document.name, schema.collection),
        fields: decodeFields(document.fields || {})
      });
    }
    pageToken = body.nextPageToken || '';
  } while (pageToken);

  return documents;
}

async function main() {
  const schema = renderFirestoreSchema(settingDefinition);
  const documents = await readCollection(schema);
  const result = verifyFirestoreDocuments(schema, documents);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 1;
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
