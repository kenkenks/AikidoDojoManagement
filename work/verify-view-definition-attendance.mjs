import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseViewDefinition, checkDtoAgainstView, assertDtoAgainstView } from '../tools/view-definition-consistency.mjs';

const require = createRequire(import.meta.url);
const { makeAttendancePlan } = require('../shared/AttendanceNative.js');
const view = parseViewDefinition(fs.readFileSync(new URL('../schema/View.yml', import.meta.url), 'utf8'));

const facts = () => ({
  members:[{member_id:'M1','状態':'有効'}],
  teachers:[{teacher_id:'T1','状態':'有効','出席受付可':true}],
  locations:[{location_id:'L1','状態':'有効'}],
  billingBlocks:[{billing_block_id:'B1',location_id:'L1','状態':'有効'}],
  trainingSlots:[{slot_id:'S1',location_id:'L1',billing_block_id:'B1','状態':'有効','稽古時間分':60}],
  attendances:[]
});
const deps = () => ({
  uuid:()=> '1',
  now:()=>new Date('2099-07-09T01:00:00Z'),
  dateKey:v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10)
});
const options = () => ({
  teacher_id:'T1', location_id:'L1', billing_block_id:'B1', attendance_session_id:'SESSION',
  attendance_date:'2099-07-09', target_month:'2099-07',
  attendance_items:[{member_id:'M1',slot_ids:['S1']}], require_teacher:true,
  initial_status:'有効', sync_unselected:true
});

test('View.yml starts with Attendance source and member-month key', () => {
  assert.equal(view.view, 'MemberMonthlySummary');
  assert.deepEqual(view.key, ['member_id', 'target_month']);
  assert.equal(view.sources.attendance.identity, 'attendance_id');
  assert.deepEqual(view.sources.attendance.fields, ['attendance_id']);
});

test('actual Attendance DTO satisfies current View.yml without repacking', () => {
  const dto = makeAttendancePlan(options(), facts(), deps()).rowsToAppend[0];
  assert.deepEqual(checkDtoAgainstView(view, 'attendance', dto), {
    ok: true,
    required: ['member_id', 'target_month', 'attendance_id'],
    missing: []
  });
});

test('adding a View field immediately detects a DTO mismatch', () => {
  const extended = structuredClone(view);
  extended.sources.attendance.fields.push('not_yet_in_dto');
  const dto = makeAttendancePlan(options(), facts(), deps()).rowsToAppend[0];
  assert.throws(() => assertDtoAgainstView(extended, 'attendance', dto), /DTOにないView項目: not_yet_in_dto/);
});
