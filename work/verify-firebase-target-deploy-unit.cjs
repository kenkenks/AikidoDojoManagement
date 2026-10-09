'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const deployRoot = path.join(root, '.build', 'dev-firebase', 'cloud-run', 'dojo-time-travel-admin');

test('dev-firebase target build creates self-contained Cloud Run deploy unit', () => {
  const result = spawnSync(process.execPath, ['tools/target.mjs', 'build', 'dev-firebase'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  for (const rel of [
    'cloud/api/server.cjs',
    'cloud/api/admin-api.cjs',
    'cloud/member-read/DAO_Core_Firestore.cjs',
    'cloud/member-read/DAO_Core_Values.cjs',
    'shared/DAO_Business.js',
    'shared/DAO_Definitions.js',
    'shared/DAO_Definition_Setting.generated.js',
    'shared/StorageId.js',
    'shared/Flow.js',
    'cloud/time-travel/admin-server.cjs',
    'cloud/time-travel/admin-api.cjs',
    'cloud/time-travel/target.cjs',
    'targets/dev-firebase.json',
    '.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs',
    'package.json',
    'package-lock.json'
  ]) {
    assert.equal(fs.existsSync(path.join(deployRoot, rel)), true, `missing deploy artifact: ${rel}`);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(deployRoot, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.scripts, { start: 'node cloud/api/server.cjs' });
  assert.equal(pkg.scripts['gcp-build'], undefined);

  const names = fs.readdirSync(deployRoot);
  assert.equal(names.includes('docs'), false);
  assert.equal(names.includes('gas'), false);
  assert.equal(names.includes('work'), false);
  assert.equal(names.includes('tools'), false);
});


test('dev-firebase target push targets existing unified Dojo service (dry-run only)', () => {
  const result = spawnSync(process.execPath, ['tools/target.mjs', 'push', 'dev-firebase'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, DOJO_DEPLOY_DRY_RUN: '1' }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[DRY RUN\] gcloud run deploy dojo-time-travel-admin/);
  assert.match(result.stdout, /\[DRY RUN\] firebase deploy --only hosting/);
  assert.ok(result.stdout.indexOf('[DRY RUN] gcloud') < result.stdout.indexOf('[DRY RUN] firebase'));
});
