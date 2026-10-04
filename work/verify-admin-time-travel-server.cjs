'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'cloud', 'time-travel', 'admin-server.cjs');
const packagePath = path.join(root, 'package.json');

test('TimeTrip admin server composes Firebase Auth with existing TimeTrip target', () => {
  const source = fs.readFileSync(serverPath, 'utf8');

  assert.match(source, /firebase-admin\/app/);
  assert.match(source, /firebase-admin\/auth/);
  assert.match(source, /createAdminTimeTravelApi/);
  assert.match(source, /createTimeTravelTarget/);
  assert.match(source, /verifyIdToken\(token,\s*revoked\)/);
  assert.match(source, /application\.getTimeTravel\(\)/);
  assert.match(source, /application\.saveTimeTravel\(input\)/);
  assert.match(source, /targets['"],\s*['"]dev-firebase\.json/);
  assert.match(source, /process\.env\.PORT/);
  assert.match(source, /['"]0\.0\.0\.0['"]/);
  assert.match(source, /listen\(port,\s*host/);
  assert.match(source, /req\.url === ['"]\/hello['"]/);
});

test('TimeTrip admin server rejects Auth emulator configuration', () => {
  const source = fs.readFileSync(serverPath, 'utf8');
  assert.match(source, /FIREBASE_AUTH_EMULATOR_HOST/);
  assert.match(source, /AUTH_EMULATOR_NOT_ALLOWED/);
});
test('Cloud Run source deployment builds TimeTrip artifact and starts existing admin server', () => {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.equal(packageJson.scripts['gcp-build'], 'npm run target:build -- dev-firebase');
  assert.equal(packageJson.scripts.start, 'node cloud/time-travel/admin-server.cjs');
});
