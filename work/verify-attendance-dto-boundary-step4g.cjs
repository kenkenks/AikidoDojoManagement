'use strict';
// No live Firestore access. Verify decoded REST values and GAS attendance status semantics.
const test = require('node:test');
const assert = require('node:assert/strict');
const {decodeFields} = require('../cloud/member-read/DAO_Core_Values.cjs');
const {createAttendanceSavedState} = require('../cloud/attendance/saved-state.cjs');
const params = {member_id:'M1',location_id:'L1',billing_block_id:'B1',attendance_date:'2026-10-11'};
function runWith(rows) {
  return createAttendanceSavedState({
    memberDao:{readById:async()=>({status:'有効',current_rank:'一級'})},
    attendanceDao:{queryEqual:async()=>rows}
  })(params);
}
test('REST decoder retains string date, null and timestamp ISO string',()=>{
  const row=decodeFields({'稽古日':{stringValue:'2026-10-11'},'状態':{nullValue:null},'登録日時':{timestampValue:'2026-10-11T01:02:03Z'}});
  assert.equal(row['稽古日'],'2026-10-11');
  assert.equal(row['状態'],null);
  assert.equal(row['登録日時'],'2026-10-11T01:02:03Z');
});
test('GAS active-state whitelist excludes unknown and cancelled states',async()=>{
  const statuses=['','有効','在籍','TRUE','取消','cancelled','canceled','退会','FALSE','保留'];
  const rows=statuses.map((status,i)=>({slot_id:'S'+i,'状態':status}));
  const result=await runWith(rows);
  assert.deepEqual(result.selected_slot_ids,['S0','S1','S2','S3']);
});
test('null and missing status match GAS empty-status behavior',async()=>{
  const result=await runWith([{slot_id:'A','状態':null},{slot_id:'B'},{slot_id:'C','状態':'取消'}]);
  assert.deepEqual(result.selected_slot_ids,['A','B']);
});
