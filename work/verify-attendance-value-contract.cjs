'use strict';
// Local contract tests only: no Firestore reads, writes, authentication or deployment.
const test = require('node:test');
const assert = require('node:assert/strict');
const {definitions} = require('../shared/DAO_Definitions.js');
const {createAttendanceSavedState} = require('../cloud/attendance/saved-state.cjs');
const params = {member_id:'M1',location_id:'L1',billing_block_id:'B1',attendance_date:'2026-10-11'};
function fixture(member, rows) {
  const queries=[];
  const run=createAttendanceSavedState({
    memberDao:{readById:async()=>member},
    attendanceDao:{queryEqual:async(source,filters)=>{queries.push({source,filters});return rows;}}
  });
  return {run,queries};
}
test('physical Firestore attendance fields are the shared DAO contract',()=>{
  const source=definitions.attendance.sources.firestore;
  assert.equal(source.collection,'attendances');
  for(const name of ['稽古日','状態','member_id','location_id','billing_block_id','slot_id']) {
    assert.equal(source.fields[name],name);
  }
});
test('physical Japanese cancellation status takes precedence over legacy status',async()=>{
  const f=fixture({status:'有効',current_rank:'一級'},[
    {slot_id:'A','状態':'取消',status:'登録'},
    {slot_id:'B','状態':'有効',status:'取消'},
    {slot_id:' C ','状態':'有効'},
    {slot_id:'C','状態':'有効'},
    {slot_id:'','状態':'有効'}
  ]);
  const result=await f.run(params);
  assert.deepEqual(result.selected_slot_ids,['B','C']);
  assert.deepEqual(f.queries[0].filters,[
    {field:'稽古日',value:'2026-10-11'},
    {field:'member_id',value:'M1'},
    {field:'location_id',value:'L1'},
    {field:'billing_block_id',value:'B1'}
  ]);
});
test('empty rank and no rows remain GAS-compatible',async()=>{
  const f=fixture({status:'在籍',current_rank:null},[]);
  assert.deepEqual(await f.run(params),{ok:true,member_id:'M1',current_rank:'',selected_slot_ids:[]});
});
test('invalid calendar date is rejected before DAO query',async()=>{
  const f=fixture({status:'有効'},[]);
  assert.equal((await f.run({...params,attendance_date:'2026-02-30'})).ok,false);
  assert.equal(f.queries.length,0);
});
test('inactive or missing member cannot query attendance',async()=>{
  for(const member of [null,{status:'退会'}]) {
    const f=fixture(member,[]);
    assert.equal((await f.run(params)).ok,false);
    assert.equal(f.queries.length,0);
  }
});
