'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const webRoot = path.join(root, '.build', 'dev-firebase', 'web', 'qr');

test('dev-firebase target build creates Firebase Web runtime config', () => {
  const result = spawnSync(process.execPath, ['tools/target.mjs', 'build', 'dev-firebase'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const runtimePath = path.join(webRoot, 'runtime_config.js');
  assert.equal(fs.existsSync(runtimePath), true, 'runtime_config.js must be generated');
  assert.equal(fs.existsSync(path.join(webRoot, 'time_travel.html')), true, 'Firebase Web artifact must include web/qr sources');

  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(runtimePath, 'utf8'), context);
  const config = context.window.DOJO_RUNTIME_CONFIG;

  assert.equal(config.target, 'dev-firebase');
  assert.equal(config.runtime, 'firebase');
  assert.equal(config.apiBaseUrl, 'https://dojo-time-travel-admin-374758850136.asia-northeast1.run.app');
  assert.equal(config.firebase.projectId, 'dojo-management-dev');
  assert.equal(config.firebase.authDomain, 'dojo-management-dev.firebaseapp.com');
  assert.match(config.firebase.apiKey, /^AIza/);
  assert.match(config.firebase.appId, /^1:374758850136:web:/);
});
