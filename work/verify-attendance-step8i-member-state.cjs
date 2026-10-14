'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict');
const {createMemberAttendanceState}=require('../cloud/attendance/member-state.cjs');
const member={member_id:'M001',member_name:'テスト',status:'有効',current_rank:'三級'};
const progress={ok:true,member_name:'テスト',current_rank:'三級',rank_sort_order:3,next_rank:'二級',rank_source:'ranks',training_count:20,required_training_count:30,required_training_count_source:'rule',remaining_training_count:10,examination_ready:false,recent_attendance_dates:[]};
const billing={plan_id:'P001',plan_name:'月謝',selected:true,candidates:[{plan_id:'P001',plan_name:'月謝'}]};
const params={member_id:'M001',location_id:'L1',billing_block_id:'B1',attendance_date:'2026-10-14'};
function deps(overrides={}) {return {memberDao:{readById:async()=>member},attendanceDao:{queryEqual:async()=>[{slot_id:'S1','状態':'有効'},{slot_id:'S2','状態':'取消'}]},readProgress:async()=>progress,readBillingSelection:async()=>billing,validateScope:async()=>{},...overrides};}
test('GAS member state field contract assembled without invented business results',async()=>{
 const result=await createMemberAttendanceState(deps())(params);
 assert.equal(result.ok,true); assert.deepEqual(result.selected_slot_ids,['S1']); assert.equal(result.training_count,20);assert.equal(result.billing_plan_id,'P001');assert.equal(result.examination_ready,false);
 for(const key of ['rank_sort_order','next_rank','rank_source','required_training_count_source','remaining_training_count','recent_attendance_dates','billing_plan_candidates'])assert.ok(Object.hasOwn(result,key),key);
});
test('invalid member and attendance scope fail closed before progress and billing',async()=>{
 let count=0; const read=createMemberAttendanceState(deps({memberDao:{readById:async()=>({...member,status:'退会'})},readProgress:async()=>{count++;return progress;}}));
 assert.equal((await read(params)).ok,false);assert.equal(count,0);
});
test('missing business dependencies reject at construction',()=>{
 assert.throws(()=>createMemberAttendanceState(deps({readProgress:null})),/DEPENDENCIES_REQUIRED/);
});
test('missing progress or billing facts never return partial successful state',async()=>{
 await assert.rejects(createMemberAttendanceState(deps({readProgress:async()=>({ok:false})}))(params),/BUSINESS_DATA_UNAVAILABLE/);
 await assert.rejects(createMemberAttendanceState(deps({readBillingSelection:async()=>null}))(params),/BUSINESS_DATA_UNAVAILABLE/);
});
test('bad date rejects without calling progress',async()=>{
 let count=0; const read=createMemberAttendanceState(deps({readProgress:async()=>{count++;return progress;}}));
 assert.equal((await read({...params,attendance_date:'2026-02-30'})).ok,false);assert.equal(count,0);
});
