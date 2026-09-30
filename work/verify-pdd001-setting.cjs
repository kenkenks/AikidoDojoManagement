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
    schema: {
      entity: 'setting',
      version: '0.1',
      fields: {
        key: { type: 'string', required: true, primaryKey: true },
        value: { type: 'string', required: true, primaryKey: false }
      }
    },
    writable: ['key', 'value'],
    sources: {
      firestore: { collection: 'settings', keyField: 'key', fields: { key: 'key', value: 'value' } },
      gas: { sheet: '99_設定', keyColumn: 1, valueColumn: 2, keyField: 'キー', fields: { key: 'キー', value: '値' } }
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


test('Firestore Renderer projects the portable Setting Definition without I/O', () => {
  const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');
  const { renderFirestoreSchema } = require('../shared/Schema_Renderer_Firestore.js');
  assert.deepEqual(renderFirestoreSchema(settingDefinition), {
    entity: 'setting',
    version: '0.1',
    collection: 'settings',
    documentIdField: 'key',
    fields: [
      { logicalName: 'key', physicalName: 'key', type: 'string', required: true, documentId: true },
      { logicalName: 'value', physicalName: 'value', type: 'string', required: true, documentId: false }
    ]
  });
});

test('Firestore Renderer verifies document ID and physical field types', () => {
  const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');
  const { renderFirestoreSchema, verifyFirestoreDocuments } = require('../shared/Schema_Renderer_Firestore.js');
  const schema = renderFirestoreSchema(settingDefinition);
  assert.deepEqual(verifyFirestoreDocuments(schema, [
    { id: 'TIME_TRAVEL_ENABLED', fields: { value: 'FALSE' } },
    { id: 'DEBUG_DATE', fields: { value: '' } }
  ]), {
    ok: true,
    entity: 'setting',
    collection: 'settings',
    documents: 2,
    errors: []
  });

  assert.deepEqual(verifyFirestoreDocuments(schema, [
    { id: 'BROKEN', fields: { value: 123 } }
  ]).errors, [
    { documentId: 'BROKEN', field: 'value', error: 'TYPE_MISMATCH:string' }
  ]);
});


test('Firestore Renderer projects logical Setting records into writable documents', () => {
  const { settingDefinition } = require('../shared/DAO_Definition_Setting.generated.js');
  const { renderFirestoreSchema, renderFirestoreDocuments } = require('../shared/Schema_Renderer_Firestore.js');
  const schema = renderFirestoreSchema(settingDefinition);
  assert.deepEqual(renderFirestoreDocuments(schema, [
    { key: 'TIME_TRAVEL_ENABLED', value: 'FALSE' },
    { key: 'DEBUG_DATE', value: '' }
  ]), [
    { id: 'TIME_TRAVEL_ENABLED', fields: { value: 'FALSE' } },
    { id: 'DEBUG_DATE', fields: { value: '' } }
  ]);
  assert.throws(() => renderFirestoreDocuments(schema, [
    { key: 'BROKEN', value: 123 }
  ]), /TYPE_MISMATCH:value:string/);
});
