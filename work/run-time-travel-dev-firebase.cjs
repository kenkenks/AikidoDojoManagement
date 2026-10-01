'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const profile = JSON.parse(fs.readFileSync(path.join(root, 'targets', 'dev-firebase.json'), 'utf8'));
const artifactPath = path.join(root, '.build', 'portable-timetravel-firestore', 'DojoTimeTravelFirestore.cjs');

if (!fs.existsSync(artifactPath)) {
  throw new Error('FIREBASE_BUILD_REQUIRED: npm run target:build -- dev-firebase');
}

const { createApplication } = require(artifactPath);

async function getAccessToken() {
  const explicit = process.env.FIRESTORE_DEV_ACCESS_TOKEN;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() });
    const token = await admin.app().options.credential.getAccessToken();
    if (typeof token?.access_token === 'string' && token.access_token.trim()) return token.access_token.trim();
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      throw new Error(`FIRESTORE_ADC_FAILED: ${error?.message || error}`);
    }
  }

  throw new Error('FIRESTORE_AUTH_REQUIRED: set FIRESTORE_DEV_ACCESS_TOKEN or configure firebase-admin Application Default Credentials');
}

async function main() {
  const args = process.argv.slice(2);
  let settingCollection = null;

  if (args[0] === '--collection') {
    if (!args[1]) {
      throw new Error('Missing collection name after --collection');
    }
    settingCollection = args.splice(0, 2)[1];
  }

  const [command = 'get', inputFile, ...extra] = args;

  if (!['get', 'save'].includes(command) || extra.length || (command === 'save') !== Boolean(inputFile)) {
    throw new Error('Usage: node work/run-time-travel-dev-firebase.cjs [--collection <collection>] get | save <input.json>');
  }

  const app = createApplication({
    projectId: profile.projectId,
    mode: profile.mode,
    confirmedDevelopmentProject: profile.confirmedDevelopmentProject,
    ...(settingCollection ? { settingCollection } : {})
  }, { getAccessToken });

  const result = command === 'get'
    ? await app.getTimeTravel()
    : await app.saveTimeTravel(JSON.parse(fs.readFileSync(path.resolve(inputFile), 'utf8')));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
