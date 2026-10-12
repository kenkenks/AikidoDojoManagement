'use strict';
// Static contract guard: physical Firestore mapping versus saved-state query.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {definitions} = require('../shared/DAO_Definitions.js');
const source = fs.readFileSync(require.resolve('../cloud/attendance/saved-state.cjs'),'utf8');
const physical = definitions.attendance.sources.firestore;
const member = definitions.members.sources.firestore;

test('saved-state queries the defined physical attendance collection', () => {
  assert.equal(physical.collection, 'attendances');
  assert.match(source, /collection:\s*'attendances'/);
});
test('all saved-state query fields exist in physical attendance mapping', () => {
  for (const field of ['稽古日','member_id','location_id','billing_block_id']) {
    assert.equal(physical.fields[field], field, `unmapped Firestore field: ${field}`);
    assert.ok(source.includes(`field:'${field}'`), `missing query field: ${field}`);
  }
});
test('saved-state projection and cancellation fields are physically mapped', () => {
  for (const field of ['slot_id','状態','current_rank']) {
    const mapping = field === 'current_rank' ? member.fields : physical.fields;
    assert.equal(mapping[field], field, `unmapped field: ${field}`);
  }
  assert.equal(member.collection,'members');
  assert.match(source, /row\['状態'\]/);
});
test('logical schema field aliases are not silently used as physical field names', () => {
  const schema = fs.readFileSync(require.resolve('../schema/Attendance.yml'),'utf8');
  assert.match(schema,/name: attendance_date/);
  assert.match(schema,/name: status/);
  assert.match(source,/field:'稽古日'/);
  assert.match(source,/row\['状態'\]/);
});
