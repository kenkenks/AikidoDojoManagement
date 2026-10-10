'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cwd = path.join(root, '.build', 'dev-gas', 'gas');
if (!fs.existsSync(path.join(cwd, '.clasp.json')) || !fs.existsSync(path.join(cwd, '32_MasterInventory.js'))) {
  console.error('Build GAS target first: npm run target:build -- dev-gas');
  process.exit(1);
}
const args = ['run', 'runner_gas2firebase_master_inventory', '--user', 'dojo-dev', '--json'];
const p = process.platform === 'win32'
  ? spawnSync('clasp.cmd', args, { cwd, encoding: 'utf8', shell: true, windowsHide: true })
  : spawnSync('clasp', args, { cwd, encoding: 'utf8' });
if (p.error || p.status !== 0) {
  console.error('GAS inventory failed:', p.error?.message || p.stderr || p.stdout);
  process.exit(1);
}
let result;
try { result = JSON.parse(p.stdout); } catch { console.error('Invalid clasp JSON:', p.stdout); process.exit(1); }
if (result.response?.ok !== true || !Array.isArray(result.response.sheets)) {
  console.error('Unexpected GAS result:', JSON.stringify(result).slice(0, 1500)); process.exit(1);
}
const output = { collected_at: new Date().toISOString(), sheets: result.response.sheets };
const dest = path.join(root, 'work', 'master-inventory-result.json');
fs.writeFileSync(dest, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, file: dest, sheets: output.sheets.map(s => ({ sheet: s.sheet, count: s.count, ok: s.ok, error: s.error })) }, null, 2));
if (output.sheets.some(s => !s.ok)) process.exitCode = 2;
