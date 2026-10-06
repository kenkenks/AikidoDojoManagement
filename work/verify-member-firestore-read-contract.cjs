'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createDao } = require('../shared/DAO_Business.js');
const { definitions } = require('../shared/DAO_Definitions.js');

const memberFields = [
  'member_id', 'member_name', 'member_name_kana', 'member_type', 'status',
  'billing_group_id', 'joined_date', 'withdrawn_date', 'suspension_start_month',
  'suspension_end_month', 'birth_date', 'insurance_type', 'email', 'phone',
  'remarks', 'current_rank', 'rank_source', 'rank_updated_at', 'rank_start_date',
  'carried_training_count', 'eligible_training_count'
];

test('Member portable definition uses the migrated 21-field contract for GAS and Firestore', () => {
  const definition = definitions.members;
  assert.deepEqual(Object.keys(definition.sources.firestore.fields), memberFields);
  assert.deepEqual(Object.keys(definition.sources.gas.fields), memberFields);
  assert.equal(definition.sources.firestore.collection, 'members');
  assert.equal(definition.sources.firestore.keyField, 'member_id');
  assert.equal(definition.sources.gas.sheet, '01_会員マスタ');
  assert.equal(definition.sources.gas.keyField, 'member_id');
  assert.equal(definition.sources.firestore.fields.status, 'status');
  assert.equal(definition.sources.gas.fields.status, 'status');
});

test('Firestore Member readById returns the same 21-field logical DTO contract', async () => {
  const calls = [];
  const stored = Object.fromEntries(memberFields.filter(key => key !== 'member_id').map(key => [key, `${key}-value`]));
  stored.carried_training_count = 2;
  stored.eligible_training_count = 12;
  const core = {
    async readById(source, id) {
      calls.push({ source, id });
      return stored;
    }
  };
  const dao = createDao(core, 'firestore');
  const dto = await dao.readById('members', 'M001');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].source.collection, 'members');
  assert.equal(calls[0].id, 'M001');
  assert.deepEqual(Object.keys(dto), memberFields);
  assert.equal(dto.member_id, 'M001');
  assert.equal(dto.member_name, 'member_name-value');
  assert.equal(dto.status, 'status-value');
  assert.equal(dto.carried_training_count, 2);
  assert.equal(dto.eligible_training_count, 12);
  assert.equal(Object.hasOwn(dto, '状態'), false);
});
