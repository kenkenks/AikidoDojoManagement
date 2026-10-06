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

const EXPECTED_NUMBER_FIELDS = new Set([
  'carried_training_count',
  'eligible_training_count'
]);

const TEMPORAL_FIELDS = new Set([
  'joined_date',
  'withdrawn_date',
  'suspension_start_month',
  'suspension_end_month',
  'birth_date',
  'rank_updated_at',
  'rank_start_date'
]);

test('Member PDD logical value types keep counts numeric and all other fields string', () => {
  for (const field of definition.fields) {
    const expectedType = EXPECTED_NUMBER_FIELDS.has(field.name) ? 'number' : 'string';
    assert.equal(field.type, expectedType, `${field.name}: unexpected logical type`);
    assert.equal(transformed.schema.fields[field.name].type, expectedType, `${field.name}: transformed type mismatch`);
  }
});

test('Member temporal fields remain string until a portable temporal type contract exists', () => {
  for (const fieldName of TEMPORAL_FIELDS) {
    const field = definition.fields.find(({ name }) => name === fieldName);
    assert.ok(field, `${fieldName}: missing field`);
    assert.equal(field.type, 'string', `${fieldName}: temporal type changed without a portable contract`);
  }
});
