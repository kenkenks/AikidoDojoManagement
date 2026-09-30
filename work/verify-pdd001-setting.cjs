const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('PDD001 Setting Definition generates the existing GAS/Firestore contract', () => {
  cp.execFileSync(process.execPath, ['tools/build-portable-data-definition.mjs'], { cwd: root, stdio: 'pipe' });
  delete require.cache[require.resolve('../shared/DAO_Definition_Setting.generated.js')];
  const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');
  assert.deepEqual(settingDefinition, {
    writable: ['key', 'value'],
    sources: {
      firestore: { collection: 'settings', keyField: 'key', fields: { key: 'key', value: 'value' } },
      gas: { sheet: '99_設定', keyColumn: 1, valueColumn: 2, keyField: 'key', fields: { key: 'key', value: 'value' } }
    }
  });
});

test('DAO registry consumes the generated Setting Definition', () => {
  const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');
  delete require.cache[require.resolve('../shared/DAO_Definitions.js')];
  const { definitions } = require('../shared/DAO_Definitions.js');
  assert.deepEqual(definitions.setting, settingDefinition);
});

test('Time Travel builders bundle the generated Setting Definition', () => {
  for (const script of [
    'tools/build-time-travel.mjs',
    'tools/build-time-travel-step2.mjs',
    'tools/build-time-travel-step2-gas-runtime.mjs',
    'tools/build-time-travel-step2-firestore.mjs'
  ]) cp.execFileSync(process.execPath, [script], { cwd: root, stdio: 'pipe' });

  for (const artifact of [
    'gas/DojoTimeTravel.js',
    'gas/DojoTimeTravelStep2.js',
    '.build/portable-timetravel-step2-firestore/DojoTimeTravelStep2.cjs'
  ]) {
    const source = fs.readFileSync(path.join(root, artifact), 'utf8');
    assert.match(source, /Generated from schema\/Setting\.yml/);
    assert.match(source, /"collection": "settings"/);
    assert.match(source, /"sheet": "99_設定"/);
  }
});
