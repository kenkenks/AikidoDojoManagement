import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPortableDataDefinition } from '../tools/portable-data-definition-builder.mjs';

test('Portable Definition builder generates arbitrary entity artifacts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pdd-builder-'));
  try {
    const schemaPath = join(dir, 'Sample.yml');
    const definitionOutputPath = join(dir, 'DAO_Definition_Sample.generated.js');
    const gasCreateOutputPath = join(dir, 'DojoPddCreateSample.generated.js');
    writeFileSync(schemaPath, `entity: sample\nversion: 0.1\nfields:\n  - name: sample_id\n    type: string\n    required: true\n    primary_key: true\n    gas_name: ID\n    firestore_name: document_id\n  - name: label\n    type: string\n    required: true\n    gas_name: 表示名\n    firestore_name: display_name\nsources:\n  gas:\n    sheet: 98_サンプル\n  firestore:\n    collection: sampleDocuments\n`, 'utf8');

    const result = buildPortableDataDefinition({
      schemaPath,
      definitionOutputPath,
      gasCreateOutputPath,
      schemaLabel: 'schema/Sample.yml',
      exportName: 'sampleDefinition',
      gasName: 'Sample'
    });

    assert.equal(result.transformed.schema.entity, 'sample');
    assert.equal(result.transformed.sources.firestore.collection, 'sampleDocuments');
    assert.equal(result.transformed.sources.firestore.fields.sample_id, 'document_id');
    assert.match(readFileSync(definitionOutputPath, 'utf8'), /const sampleDefinition =/);
    const gas = readFileSync(gasCreateOutputPath, 'utf8');
    assert.match(gas, /function dojoPddDescribeSampleGas_\(\)/);
    assert.match(gas, /function dojoPddEnsureSampleGas_\(spreadsheet\)/);
    assert.match(gas, /98_サンプル/);
    assert.match(gas, /\["ID","表示名"\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
