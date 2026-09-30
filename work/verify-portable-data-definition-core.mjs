import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePortableDefinition, transformPortableDefinition } from '../tools/portable-data-definition-core.mjs';

test('Portable Definition core transforms an arbitrary entity and Firestore collection', () => {
  const source = `entity: sample\nversion: "1.0"\n\nfields:\n  - name: sample_id\n    gas_name: "ID"\n    type: string\n    primary_key: true\n    required: true\n  - name: label\n    gas_name: "名称"\n    type: string\n\nsources:\n  gas:\n    sheet: "90_サンプル"\n  firestore:\n    collection: samples\n`;
  const definition = parsePortableDefinition(source);
  const transformed = transformPortableDefinition(definition);
  assert.equal(transformed.schema.entity, 'sample');
  assert.equal(transformed.sources.firestore.collection, 'samples');
  assert.equal(transformed.sources.firestore.keyField, 'sample_id');
  assert.deepEqual(transformed.sources.firestore.fields, { sample_id: 'sample_id', label: 'label' });
  assert.equal(transformed.sources.gas.sheet, '90_サンプル');
  assert.equal(transformed.sources.gas.keyField, 'ID');
});

test('Portable Definition core preserves declared field types for renderers', () => {
  const definition = {
    entity: 'sample', version: '1.0',
    fields: [
      { name: 'sample_id', type: 'string', primary_key: true, required: true },
      { name: 'count', type: 'number' }
    ],
    sources: { gas: { sheet: '90_サンプル' }, firestore: { collection: 'samples' } }
  };
  const transformed = transformPortableDefinition(definition);
  assert.equal(transformed.schema.fields.count.type, 'number');
});
