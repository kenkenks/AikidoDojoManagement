'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'gas', '29_MemberValueTypeDiagnostic.js'), 'utf8');

function load(memberRows) {
  const logs = [];
  const sandbox = {
    console,
    Object,
    String,
    JSON,
    createSheetContext: () => ({ marker: 'ctx' }),
    daoMemberGetAll_: () => memberRows,
    Logger: { log: value => logs.push(value) }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { sandbox, logs };
}

const fields = [
  'member_id','member_name','member_name_kana','member_type','status','billing_group_id',
  'joined_date','withdrawn_date','suspension_start_month','suspension_end_month','birth_date',
  'insurance_type','email','phone','remarks','current_rank','rank_source','rank_updated_at',
  'rank_start_date','carried_training_count','eligible_training_count'
];

test('diagnostic reports only type metadata for all 21 Member fields', () => {
  const row = Object.fromEntries(fields.map(field => [field, `${field}-SECRET`]));
  row.member_id = 'M001';
  row.joined_date = new Date('2026-01-01T00:00:00Z');
  row.withdrawn_date = '';
  row.carried_training_count = 0;
  row.eligible_training_count = 12;

  const { sandbox, logs } = load([row]);
  const result = sandbox.runner_diagnostic_member_value_types('M001');

  assert.equal(result.ok, true);
  assert.equal(result.field_count, 21);
  assert.deepEqual(Object.keys(result.fields), fields);
  assert.equal(result.fields.joined_date.is_date, true);
  assert.equal(result.fields.withdrawn_date.is_empty_string, true);
  assert.equal(result.fields.carried_training_count.type, 'number');
  assert.equal(result.fields.carried_training_count.is_empty_string, false);
  assert.equal(logs.length, 1);
  const serialized = logs[0];
  assert.equal(serialized.includes('SECRET'), false);
  assert.equal(serialized.includes('2026-01-01T00:00:00.000Z'), false);
});

test('diagnostic fails closed without exposing requested member id', () => {
  const { sandbox, logs } = load([]);
  const result = sandbox.runner_diagnostic_member_value_types('PRIVATE-MEMBER-ID');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: false,
    diagnostic: 'MEMBER_VALUE_TYPES',
    reason: 'MEMBER_NOT_FOUND'
  });
  assert.equal(logs[0].includes('PRIVATE-MEMBER-ID'), false);
});
