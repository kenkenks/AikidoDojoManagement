'use strict';
// Compare the actual GAS saved-state function with the Firestore implementation.
// No network access, deployments, or authentication decisions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {createAttendanceSavedState} = require('../cloud/attendance/saved-state.cjs');
const gasSource = fs.readFileSync(path.join(__dirname, '../gas/04_Attendance.js'), 'utf8');
const match = gasSource.match(/function getAttendanceSavedState\(params, ctx\) \{[\s\S]*?\n\}\n/);
assert.ok(match, 'GAS saved-state implementation must exist');
const base = {member_id:'M1',location_id:'L1',billing_block_id:'B1',attendance_date:'2026-10-11'};
function runGas(params, member, rows) {
  const context = {
    ensureSheetContext: ctx => ctx,
    normalizeId_: value => String(value == null ? '' : value).trim(),
    parseAttendanceDate_: value => value,
    daoMemberGetAll_: () => member ? [{member_id:params.member_id,...member}] : [],
    getActiveAttendanceRowsForScope: () => rows.filter(row => row['状態'] !== '取消'),
    Array, Set, String
  };
  vm.runInNewContext(match[0] + '\nthis.run = getAttendanceSavedState;', context);
  return JSON.parse(JSON.stringify(context.run(params, {})));
}
async function runFirebase(params, member, rows) {
  const run = createAttendanceSavedState({
    memberDao:{readById:async()=>member},
    attendanceDao:{queryEqual:async()=>rows}
  });
  return run(params);
}
const cases = [
  ['registered and duplicate slots', {status:'有効',current_rank:'一級'}, [
    {slot_id:'S1','状態':'登録'}, {slot_id:'S1','状態':'登録'}, {slot_id:'S2','状態':'登録'}]],
  ['cancelled rows excluded', {status:'在籍',current_rank:'二級'}, [
    {slot_id:'S1','状態':'取消'}, {slot_id:'S2','状態':'登録'}]],
  ['no attendance', {status:'TRUE',current_rank:''}, []],
  ['inactive member', {status:'退会',current_rank:'一級'}, []],
  ['missing member', null, []]
];
for (const [label,member,rows] of cases) {
  test('GAS/Firebase saved-state parity: '+label, async()=>{
    assert.deepEqual(await runFirebase(base,member,rows),runGas(base,member,rows));
  });
}
test('GAS/Firebase saved-state parity: missing scope',async()=>{
  const params={...base,location_id:''};
  const member={member_id:'M1',status:'有効'};
  assert.deepEqual(await runFirebase(params,member,[]),runGas(params,member,[]));
});
