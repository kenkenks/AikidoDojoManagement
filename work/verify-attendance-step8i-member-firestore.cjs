'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createFirestoreMemberAttendanceState}=require('../cloud/attendance/member-state-firestore.cjs');
const p={member_id:'M001',location_id:'L1',billing_block_id:'B1',attendance_date:'2026-10-14'};
function setup({badId=false,missingFee=false,scopeError=false}={}) {
 const calls=[];
 const core={
  readById:async (src,id)=>{calls.push(['readById',src.collection,id]);
   if(src.collection==='members')return {member_id:badId?'M999':'M001',member_name:'会員',status:'有効',current_rank:'三級',member_type:'一般',billing_group_id:'BG1'};
   if(src.collection==='monthly_selections')return null; return null;},
  queryEqual:async (src,filters)=>{calls.push(['queryEqual',src.collection,filters]);return [];},
  readPage:async (src)=>{calls.push(['readPage',src.collection]);
   if(src.collection==='fees')return {documents:missingFee?[]:[{fields:{plan_id:'P001','表示名':'月謝','回数単価':1000,'上限金額':5000}}]};
   if(src.collection==='plan_selection_rules')return {documents:[{fields:{member_type:'一般',selectable_plan_id:'P001'}}]};
   if(src.collection==='examination_standards')return {documents:[{fields:{'現在級段位':'三級','必要稽古数':30,'進捗表示対象':true,'次回審査級段位':'二級'}}]};
   if(src.collection==='ranks')return {documents:[{fields:{'表示名':'三級',rank_id:'R3','表示順':3}}]};
   return {documents:[]};}
 };
 const read=createFirestoreMemberAttendanceState(core,{getTargetMonth:async()=> '2026-10',validateScope:async(l,b)=>{calls.push(['scope',l,b]);if(scopeError)throw new Error('INVALID_SCOPE');}});
 return {read,calls};
}
test('integrates member, attendance, progress and billing via Firestore Core',async()=>{
 const {read,calls}=setup();const result=await read(p);
 assert.equal(result.ok,true);assert.equal(result.member_id,'M001');assert.equal(result.training_count,0);
 assert.equal(result.billing_plan_selected,false);assert.equal(result.billing_plan_candidates[0].plan_id,'P001');
 for(const c of ['members','attendances','examination_standards','ranks','monthly_selections','fees','plan_selection_rules'])
  assert.ok(calls.some(call=>call[1]===c),c);
});
test('member document identity mismatch fails closed',async()=>{
 const {read}=setup({badId:true});await assert.rejects(read(p),/MEMBER_IDENTITY_CONFLICT/);
});
test('scope validation failure is not converted into a successful member state',async()=>{
 const {read}=setup({scopeError:true});await assert.rejects(read(p),/INVALID_SCOPE/);
});
test('no context or invalid collection configuration fails at construction',()=>{
 const core=setup().calls;assert.throws(()=>createFirestoreMemberAttendanceState({},{}),/CORE_REQUIRED/);
 assert.ok(Array.isArray(core));
});
test('unavailable billing candidate is not presented as a zero-price plan',async()=>{
 const {read}=setup({missingFee:true});await assert.rejects(read(p),/UNKNOWN_OR_INACTIVE_PLAN/);
});
