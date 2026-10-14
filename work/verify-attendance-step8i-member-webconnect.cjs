'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAdminApi}=require('../cloud/api/admin-api.cjs');
const {createDispatch}=require('../cloud/api/webConnect.cjs');
const params={member_id:'M1',location_id:'L1',billing_block_id:'B1',attendance_date:'2026-10-14'};
function setup(principal, admin=false, broken=false){
 let calls=0;
 const api=createAdminApi({verifyIdToken:async()=>({uid:'U1',admin}),getSystemContext:async()=>({ok:true,system_now:'2026-10-14',target_month:'2026-10',time_travel_enabled:false}),
 getTimeTravel:async()=>({}),saveTimeTravel:async()=>({}),readMember:async()=>null,readMembers:async()=>[],
 resolveDojoPrincipal:async()=>principal,readMemberAttendanceState:async input=>{calls++;if(broken)throw Error('DAO_FAILED');return {ok:true,member_id:input.member_id};}});
 return {send:(input=params,action='member_attendance_state')=>createDispatch(api)({action,input,context:{authorization:'Bearer x'}}),calls:()=>calls};
}
test('linked member reads own state via existing dispatcher',async()=>{const t=setup({member_id:'M1'});assert.equal((await t.send()).status,200);assert.equal(t.calls(),1);});
test('other member and unlinked identity are rejected before DAO',async()=>{for(const identity of [null,{member_id:'M2'},{teacher_id:'T1'}]){const t=setup(identity);assert.equal((await t.send()).status,403);assert.equal(t.calls(),0);}});
test('arbitrary parameters and unsupported write remain closed',async()=>{const t=setup({member_id:'M1'});assert.equal((await t.send({...params,target_month:'2020-01'})).status,400);assert.equal((await t.send({...params,attendance_date:null})).status,400);assert.notEqual((await t.send(params,'attendance_batch')).status,200);assert.equal(t.calls(),0);});
test('DAO failure returns 503, never fabricated state',async()=>{const t=setup({member_id:'M1'},false,true);assert.equal((await t.send()).status,503);});
test('admin retains access',async()=>{const t=setup(null,true);assert.equal((await t.send()).status,200);});
