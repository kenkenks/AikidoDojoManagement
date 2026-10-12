'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createAttendanceSavedState} = require('../cloud/attendance/saved-state.cjs');
const params={member_id:'M1',location_id:'L1',billing_block_id:'B1',attendance_date:'2026-10-11'};
function fixture(member={status:'有効',current_rank:'一級'},rows=[]) {
  let query;
  const run=createAttendanceSavedState({
    memberDao:{readById:async (source,id)=>{assert.equal(source.collection,'members');assert.equal(id,'M1');return member;}},
    attendanceDao:{queryEqual:async (source,conditions)=>{query={source,conditions};return rows;}}
  });
  return {run,getQuery:()=>query};
}
test('saved state returns GAS-compatible fields, unique active slots',async()=>{
  const f=fixture(undefined,[{slot_id:'S1','状態':'有効'},{slot_id:'S1','状態':'有効'},{slot_id:'S2','状態':'取消'},{slot_id:'S3','状態':'有効'}]);
  assert.deepEqual(await f.run(params),{ok:true,member_id:'M1',current_rank:'一級',selected_slot_ids:['S1','S3']});
  assert.deepEqual(f.getQuery(),{source:{collection:'attendances'},conditions:[{field:'稽古日',value:'2026-10-11'},{field:'member_id',value:'M1'},{field:'location_id',value:'L1'},{field:'billing_block_id',value:'B1'}]});
});
test('missing fields, invalid date and inactive member fail closed',async()=>{
  const f=fixture();
  assert.equal((await f.run({...params,location_id:''})).ok,false);
  assert.equal((await f.run({...params,attendance_date:'2026-02-30'})).ok,false);
  assert.equal((await fixture({status:'退会'}).run(params)).ok,false);
  assert.equal((await fixture(null).run(params)).ok,false);
});
