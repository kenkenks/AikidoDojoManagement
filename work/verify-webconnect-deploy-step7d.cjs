'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const deploy = path.join(root, '.build', 'dev-firebase', 'cloud-run', 'dojo-time-travel-admin');

test('Cloud Run artifact resolves all local CommonJS dependencies', () => {
  const build = spawnSync(process.execPath, ['tools/target.mjs', 'build', 'dev-firebase'],
    { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const entry = path.join(deploy, 'cloud/api/server.cjs');
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = fs.readFileSync(file, 'utf8');
    const localRequire = createRequire(file);
    for (const match of source.matchAll(/require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const resolved = localRequire.resolve(match[1]);
      assert.ok(resolved.startsWith(deploy + path.sep), `outside deploy unit: ${resolved}`);
      visit(resolved);
    }
  }
  visit(entry);
  for (const rel of ['cloud/api/webConnect.cjs', 'cloud/attendance/session-info.cjs',
    'cloud/attendance/session-masters.cjs', 'shared/WebConnectCore.js']) {
    assert.ok(visited.has(path.join(deploy, rel)), `missing runtime dependency: ${rel}`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(deploy, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.start, 'node cloud/api/server.cjs');
});

test('Cloud Run release stage defaults to no-deploy dry run', () => {
  const run = spawnSync(process.execPath, ['tools/cloud-run-release.mjs', 'stage'],
    { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /\[DRY RUN\] gcloud run deploy/);
  assert.doesNotMatch(run.stdout, /\[EXECUTE\]/);
});
