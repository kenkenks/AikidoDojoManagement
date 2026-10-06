import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parsePortableDefinition, transformPortableDefinition } from '../tools/portable-data-definition-core.mjs';

const require = createRequire(import.meta.url);
const { definitions } = require('../shared/DAO_Definitions.js');

const definition = parsePortableDefinition(fs.readFileSync('schema/Member.yml', 'utf8'));
const generated = transformPortableDefinition(definition);
const runtime = definitions.members;

function storageContract(source) {
  return {
    keyField: source.keyField,
    fields: source.fields
  };
}

test('Member PDD reproduces the current Firestore storage mapping', () => {
  assert.equal(generated.sources.firestore.collection, runtime.sources.firestore.collection);
  assert.deepEqual(
    storageContract(generated.sources.firestore),
    storageContract(runtime.sources.firestore)
  );
});

test('Member PDD reproduces the current GAS storage mapping', () => {
  assert.equal(generated.sources.gas.sheet, runtime.sources.gas.sheet);
  assert.deepEqual(
    storageContract(generated.sources.gas),
    storageContract(runtime.sources.gas)
  );
});

test('Member PDD and runtime expose the same 21 logical storage fields', () => {
  const logicalFields = definition.fields.map(({ name }) => name);
  assert.equal(logicalFields.length, 21);
  assert.deepEqual(Object.keys(runtime.sources.firestore.fields), logicalFields);
  assert.deepEqual(Object.keys(runtime.sources.gas.fields), logicalFields);
});

test('Member runtime writable policy remains separate from PDD field structure', () => {
  assert.deepEqual(runtime.writable, []);
  assert.deepEqual(generated.writable, definition.fields.map(({ name }) => name));
});
