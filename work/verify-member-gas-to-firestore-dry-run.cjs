'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./dry-run-member-gas-to-firestore.cjs');

const ROOT = path.resolve(__dirname, '..');

async function definition() {
  const { parsePortableDefinition, transformPortableDefinition } = await import('../tools/portable-data-definition-core.mjs');
  return transformPortableDefinition(parsePortableDefinition(fs.readFileSync(path.join(ROOT, 'schema', 'Member.yml'), 'utf8')));
}

function baseMember() {
  return {
    member_id: 'TEST_ONLY', member_name: 'Test', member_name_kana: 'Test', member_type: 'member', status: 'active',
    billing_group_id: 'BG001', joined_date: '2026-01-01', withdrawn_date: '', suspension_start_month: '',
    suspension_end_month: '', birth_date: '2000-01-01', insurance_type: 'x', email: 'x@example.invalid', phone: '0',
    remarks: '', current_rank: '1', rank_source: 'x', rank_updated_at: '2026-01-01', rank_start_date: '',
    carried_training_count: 0, eligible_training_count: 0
  };
}

test('dry-run uses existing PDD and Renderer without writes', async () => {
  const result = await run({ member: baseMember(), definition: await definition() });
  assert.equal(result.ok, true);
  assert.equal(result.gas_dto_fields, 21);
  assert.equal(result.pdd_fields, 21);
  assert.equal(result.firestore_documents, 1);
  assert.equal(result.writes, 0);
});

test('dry-run bridges GAS empty optional numbers to sparse Firestore fields', async () => {
  const member = baseMember();
  member.carried_training_count = '';
  member.eligible_training_count = '';
  const result = await run({ member, definition: await definition() });
  assert.equal(result.ok, true);
  assert.equal(result.firestore_documents, 1);
  assert.equal(result.writes, 0);
});

test('dry-run still rejects a non-empty invalid number without leaking member values', async () => {
  const member = baseMember();
  member.carried_training_count = 'not-a-number';
  const result = await run({ member, definition: await definition() });
  assert.equal(result.ok, false);
  assert.equal(result.first_error, 'TYPE_MISMATCH:carried_training_count:number');
  assert.equal(result.writes, 0);
  assert.equal(JSON.stringify(result).includes('x@example.invalid'), false);
});
