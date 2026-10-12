'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const deployRoot = path.join(root, '.build', 'dev-firebase', 'cloud-run', 'dojo-time-travel-admin');

test('Cloud Run deployment unit contains attendance module and resolves server imports', () => {
  const result = spawnSync(process.execPath, ['tools/target.mjs', 'build', 'dev-firebase'], {
    cwd: root, encoding: 'utf8', windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const attendancePath = path.join(deployRoot, 'cloud', 'attendance', 'saved-state.cjs');
  assert.ok(fs.existsSync(attendancePath), 'missing cloud/attendance/saved-state.cjs');
  const serverPath = path.join(deployRoot, 'cloud', 'api', 'server.cjs');
  const server = fs.readFileSync(serverPath, 'utf8');
  assert.match(server, /require\(['"]\.\.\/attendance\/saved-state\.cjs['"]\)/);
  assert.equal(typeof require(attendancePath).createAttendanceSavedState, 'function');
  const syntax = spawnSync(process.execPath, ['--check', serverPath], {encoding: 'utf8'});
  assert.equal(syntax.status, 0, syntax.stderr);
});
