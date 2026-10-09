'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function invoke(...args) {
  return spawnSync(process.execPath, ['tools/cloud-run-release.mjs', ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true
  });
}
test('staging uses no-traffic tagged existing service and never deploys Hosting', () => {
  const r = invoke('stage');
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /run deploy dojo-time-travel-admin/);
  assert.match(r.stdout, /--no-traffic --tag candidate/);
  assert.doesNotMatch(r.stdout, /allow-unauthenticated|firebase deploy|update-traffic/);
});
test('promotion and rollback require explicit revision and are dry-run by default', () => {
  for (const action of ['promote', 'rollback']) {
    assert.notEqual(invoke(action).status, 0);
    const r = invoke(action, 'dojo-time-travel-admin-00004-dzp');
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /\[DRY RUN\].*--to-revisions dojo-time-travel-admin-00004-dzp=100/);
  }
});

test('verify is read-only and targets the existing service', () => {
  const r = invoke('verify');
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /run services describe dojo-time-travel-admin/);
  assert.match(r.stdout, /--format=json/);
  assert.doesNotMatch(r.stdout, /deploy|update-traffic|firebase deploy/);
  assert.notEqual(invoke('verify', 'unexpected').status, 0);
});
