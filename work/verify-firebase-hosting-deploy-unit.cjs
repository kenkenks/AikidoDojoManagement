'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const hostingRoot = path.join(root, '.build', 'dev-firebase', 'web');

test('dev-firebase target build creates self-contained Firebase Hosting deploy unit', () => {
  const result = spawnSync(process.execPath, ['tools/target.mjs', 'build', 'dev-firebase'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const firebaseJsonPath = path.join(hostingRoot, 'firebase.json');
  assert.equal(fs.existsSync(firebaseJsonPath), true, 'Hosting deploy unit must include firebase.json');
  assert.equal(fs.existsSync(path.join(hostingRoot, 'qr', 'time_travel.html')), true, 'Hosting deploy unit must preserve /qr URL structure');
  assert.equal(fs.existsSync(path.join(hostingRoot, 'qr', 'runtime_config.js')), true, 'Hosting deploy unit must include generated runtime config');

  const config = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
  assert.equal(config.hosting.site, 'dojo-management-dev');
  assert.equal(config.hosting.public, '.');
  assert.deepEqual(config.hosting.ignore, ['firebase.json', '**/.*', '**/node_modules/**']);
  assert.deepEqual(config.hosting.headers, [
    { source: '**/*.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    { source: '**/*.js', headers: [{ key: 'Cache-Control', value: 'no-store' }] }
  ]);

  assert.equal(fs.existsSync(path.join(hostingRoot, 'docs')), false, 'Hosting deploy unit must not contain docs');
  assert.equal(fs.existsSync(path.join(hostingRoot, 'work')), false, 'Hosting deploy unit must not contain work');
  assert.equal(fs.existsSync(path.join(hostingRoot, 'tools')), false, 'Hosting deploy unit must not contain tools');
});
