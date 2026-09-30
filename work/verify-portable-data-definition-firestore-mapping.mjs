import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePortableDefinition, transformPortableDefinition } from '../tools/portable-data-definition-core.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { renderFirestoreSchema } = require('../shared/Schema_Renderer_Firestore.js');

test('Portable Definition preserves explicit Firestore physical field names', () => {
  const source = `entity: sample\nversion: "1.0"\n\nfields:\n  - name: sample_id\n    firestore_name: document_id\n    type: string\n    primary_key: true\n    required: true\n  - name: label\n    firestore_name: display_name\n    type: string\n\nsources:\n  gas:\n    sheet: "90_サンプル"\n  firestore:\n    collection: sampleDocuments\n`;
  const transformed = transformPortableDefinition(parsePortableDefinition(source));
  assert.equal(transformed.sources.firestore.collection, 'sampleDocuments');
  assert.equal(transformed.sources.firestore.keyField, 'sample_id');
  assert.deepEqual(transformed.sources.firestore.fields, { sample_id: 'document_id', label: 'display_name' });

  const rendered = renderFirestoreSchema(transformed);
  assert.equal(rendered.collection, 'sampleDocuments');
  assert.equal(rendered.documentIdField, 'document_id');
  assert.deepEqual(rendered.fields.map(({ logicalName, physicalName }) => [logicalName, physicalName]), [
    ['sample_id', 'document_id'],
    ['label', 'display_name']
  ]);
});
