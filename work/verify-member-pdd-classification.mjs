import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePortableDefinition, transformPortableDefinition } from '../tools/portable-data-definition-core.mjs';

const definition = parsePortableDefinition(fs.readFileSync('schema/Member.yml', 'utf8'));
const migrationAfter = JSON.parse(fs.readFileSync('schema/migration/Member/Member.after.json', 'utf8'));
const transformed = transformPortableDefinition(definition);

const EXPECTED_GROUPS = new Set([
  'Identity', 'Name', 'Profile', 'State', 'Relation', 'Track', 'Derived', 'Unclassified'
]);

test('Member PDD field order exactly matches migration AFTER headers', () => {
  assert.deepEqual(definition.fields.map(({ name }) => name), migrationAfter.headers);
  assert.equal(definition.fields.length, 21);
});

test('Member PDD classification uses only semantic field groups and leaves nothing unclassified', () => {
  for (const field of definition.fields) {
    assert.ok(EXPECTED_GROUPS.has(field.group), `${field.name}: unexpected group ${field.group}`);
    assert.notEqual(field.group, 'Unclassified', `${field.name}: classification is still pending`);
  }
});

test('Member PDD preserves classification in transformed logical schema', () => {
  for (const field of definition.fields) {
    assert.equal(transformed.schema.fields[field.name].group, field.group, field.name);
  }
  assert.equal(transformed.sources.gas.sheet, '01_会員マスタ');
  assert.equal(transformed.sources.firestore.collection, 'members');
  assert.equal(transformed.sources.firestore.keyField, 'member_id');
});
