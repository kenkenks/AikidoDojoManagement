#!/usr/bin/env node
'use strict';
// Checks the actual generated Cloud Run deploy unit, without credentials or network calls.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(process.argv[2] || '.build/dev-firebase/cloud-run/dojo-time-travel-admin');
const entry = path.join(root, 'cloud/api/server.cjs');
const visited = new Set();
const errors = [];
const requires = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
function resolveRelative(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  const candidates = [base, base + '.js', base + '.cjs', base + '.json', path.join(base, 'index.js'), path.join(base, 'index.cjs')];
  return candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
}
function check(file) {
  if (visited.has(file)) return;
  visited.add(file);
  if (!fs.existsSync(file)) { errors.push(`Missing entry: ${file}`); return; }
  if (!file.endsWith('.json')) {
    const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
    if (syntax.status !== 0) errors.push(`Syntax error: ${path.relative(root,file)}\n${syntax.stderr}`);
  }
  const code = fs.readFileSync(file, 'utf8');
  for (const match of code.matchAll(requires)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue; // npm and node built-ins are resolved at runtime.
    const target = resolveRelative(file, spec);
    if (!target) { errors.push(`Missing dependency: ${path.relative(root,file)} -> ${spec}`); continue; }
    if (!target.startsWith(root + path.sep)) { errors.push(`Dependency escapes deploy unit: ${spec}`); continue; }
    check(target);
  }
}
check(entry);
if (errors.length) {
  console.error('[DEPLOY VERIFY] FAIL');
  for (const error of errors) console.error(' - ' + error);
  process.exitCode = 1;
} else {
  console.log(`[DEPLOY VERIFY] PASS: ${visited.size} reachable local files, syntax and relative dependencies`);
}
