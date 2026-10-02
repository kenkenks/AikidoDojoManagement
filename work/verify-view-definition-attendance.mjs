import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseViewDefinition, checkDtoAgainstView, assertDtoAgainstView } from '../tools/view-definition-consistency.mjs';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { reconcileSystemKeys } = require('../shared/SystemKey.js');
const view = parseViewDefinition(fs.readFileSync(new URL('../schema/View.yml', import.meta.url), 'utf8'));

const attendanceDto = () => ({
  attendance_date:'2099-07-09', member_id:'M1', target_month:'2099-07',
  location_id:'L1', slot_id:'S1', billing_block_id:'B1', teacher_id:'T1',
  attendance_session_id:'SESSION', training_minutes:60, status:'有効',
  source:'attendance_core', remarks:''
});
const deps = () => ({
  uuid:()=> '1',
  now:()=>new Date('2099-07-09T01:00:00Z'),
  dateKey:v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10)
});

test('View.yml starts with Attendance source and member-month key', () => {
  assert.equal(view.view, 'MemberMonthlySummary');
  assert.deepEqual(view.key, ['member_id', 'target_month']);
  assert.equal(view.sources.attendance.identity, 'attendance_id');
  assert.deepEqual(view.sources.attendance.fields, [
    'attendance_id',
    'location_id',
    'slot_id',
    'billing_block_id',
    'teacher_id',
    'attendance_session_id'
  ]);
});

test('record-gated Attendance DTO satisfies current View.yml without repacking', () => {
  const dto = reconcileSystemKeys(attendanceDto(), deps());
  assert.deepEqual(checkDtoAgainstView(view, 'attendance', dto), {
    ok: true,
    required: [
      'member_id',
      'target_month',
      'attendance_id',
      'location_id',
      'slot_id',
      'billing_block_id',
      'teacher_id',
      'attendance_session_id'
    ],
    missing: []
  });
});

test('adding a View field immediately detects a DTO mismatch', () => {
  const extended = structuredClone(view);
  extended.sources.attendance.fields.push('not_yet_in_dto');
  const dto = reconcileSystemKeys(attendanceDto(), deps());
  assert.throws(() => assertDtoAgainstView(extended, 'attendance', dto), /DTOにないView項目: not_yet_in_dto/);
});
