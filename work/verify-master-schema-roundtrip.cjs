'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tableSchema } = require('./gas2firebase-copy.cjs');
const { renderFirestoreDocuments, verifyFirestoreDocuments, restoreFirestoreRecord } = require('../shared/Schema_Renderer_Firestore.js');
const TABLES = ['Dojo','Teacher','Fee','PlanSelectionRule','TrainingSlot','BillingBlock','Rank','ExaminationStandard'];
for (const table of TABLES) {
  test(`${table}: GAS logical -> Firestore physical -> logical DTO round trip`, async () => {
    const schema = await tableSchema(table);
    const keys = schema.fields.filter(field => field.documentId);
    assert.equal(keys.length, 1, 'exactly one document key');
    assert.equal(keys[0].type, 'string');
    const row = {};
    for (const field of schema.fields) {
      row[field.logicalName] = field.documentId ? `${table}_TEST_001`
        : field.type === 'boolean' ? true
        : field.type === 'number' ? 2
        : `sample_${field.logicalName}`;
    }
    const [document] = renderFirestoreDocuments(schema, [row], { includeDocumentIdField: true });
    assert.equal(document.fields[keys[0].physicalName], document.id);
    assert.equal(verifyFirestoreDocuments(schema, [document]).ok, true);
    assert.deepEqual(restoreFirestoreRecord(schema, document), row);
    assert.equal(Object.keys(document.fields).length, schema.fields.length);
  });
}
