import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDtoAgainstDefinition, assertDtoAgainstDefinition } from '../tools/definition-dto-consistency.mjs';

const definition = {
  entity: 'attendance',
  fields: [
    { name: 'attendance_id' },
    { name: 'member_id' },
    { name: 'target_month' },
    { name: 'status' }
  ]
};

test('DTO keys matching YAML logical field names pass unchanged', () => {
  const dto = { attendance_id: 'ATT-1', member_id: 'M001', target_month: '2026-10', status: 'active' };
  assert.deepEqual(checkDtoAgainstDefinition(definition, dto, { requiredFields: ['member_id', 'target_month'] }), {
    ok: true, unknown: [], missing: []
  });
});

test('DTO field not declared in YAML is reported', () => {
  const dto = { attendance_id: 'ATT-1', memberId: 'M001', target_month: '2026-10', status: 'active' };
  const result = checkDtoAgainstDefinition(definition, dto);
  assert.equal(result.ok, false);
  assert.deepEqual(result.unknown, ['memberId']);
});

test('required DTO field missing from the passed data is reported', () => {
  const dto = { attendance_id: 'ATT-1', member_id: 'M001', status: 'active' };
  const result = checkDtoAgainstDefinition(definition, dto, { requiredFields: ['member_id', 'target_month'] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['target_month']);
});

test('assertion explains both kinds of mismatch without rewriting DTO', () => {
  const dto = { attendance_id: 'ATT-1', memberId: 'M001', status: 'active' };
  assert.throws(
    () => assertDtoAgainstDefinition(definition, dto, { requiredFields: ['member_id', 'target_month'] }),
    /YAMLにない項目: memberId.*DTOにない必須項目: member_id, target_month/
  );
});
