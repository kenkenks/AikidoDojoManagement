'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createFirestoreCore } = require('../cloud/member-read/DAO_Core_Firestore.cjs');

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
  const [memberId = 'TEST_MEMBER_001', ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('Usage: node work/read-member-firestore-real.cjs [member_id]');

  const core = createFirestoreCore(profile, { getAccessToken });
  const fields = await core.readById({ collection: 'members' }, memberId);

  process.stdout.write(JSON.stringify({
    operation: 'read-only',
    projectId: profile.projectId,
    collection: 'members',
    memberId,
    found: fields !== null,
    fieldNames: fields === null ? [] : Object.keys(fields),
    fields
  }, null, 2) + '\n');

  if (fields === null) process.exitCode = 2;
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
