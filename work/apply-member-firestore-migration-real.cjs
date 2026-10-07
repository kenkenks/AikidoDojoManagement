'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createFirestoreCore } = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const { executeMemberFirestoreMigration } = require('./execute-member-firestore-migration.cjs');
const root = path.resolve(__dirname, '..');
const profile = JSON.parse(fs.readFileSync(path.join(root, 'targets', 'dev-firebase.json'), 'utf8'));
const COLLECTION = 'members';
const ALLOWED_MEMBER_ID = 'TEST_MEMBER_001';

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

function assertRealMigrationTarget(memberId, targetProfile = profile) {
  if (targetProfile.target !== 'dev-firebase' ||
      targetProfile.mode !== 'development' ||
      targetProfile.projectId !== 'dojo-management-dev' ||
      targetProfile.confirmedDevelopmentProject !== 'dojo-management-dev') {
    throw new Error('REAL_MEMBER_MIGRATION_DEV_TARGET_REQUIRED');
  }
  if (memberId !== ALLOWED_MEMBER_ID) throw new Error(`REAL_MEMBER_MIGRATION_TEST_MEMBER_ONLY: ${ALLOWED_MEMBER_ID}`);
}

async function main() {
  const [memberId = ALLOWED_MEMBER_ID, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error(`Usage: node work/apply-member-firestore-migration-real.cjs [${ALLOWED_MEMBER_ID}]`);
  assertRealMigrationTarget(memberId);
  const core = createFirestoreCore(profile, { getAccessToken });
  const result = await executeMemberFirestoreMigration(core, { collection: COLLECTION }, memberId);
  process.stdout.write(JSON.stringify({ operation: 'real-migration', projectId: profile.projectId, collection: COLLECTION, ...result }, null, 2) + '\n');
  if (!result.ok) process.exitCode = 2;
}
if (require.main === module) main().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });
module.exports = { assertRealMigrationTarget, ALLOWED_MEMBER_ID, COLLECTION };
