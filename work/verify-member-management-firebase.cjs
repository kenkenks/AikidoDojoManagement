'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createMemberManagementCommand}=require('../cloud/member-management/member-command.cjs');
const {createAdminApi}=require('../cloud/api/admin-api.cjs');
const WebConnectCore=require('../shared/WebConnectCore.js');
function memory(initial={}){
  const data=new Map(Object.entries(initial));
  const db={collection:name=>({doc:id=>({id,path:name+'/'+id})}),runTransaction:async fn=>fn({
    get:async ref=>({exists:data.has(ref.id),data:()=>data.get(ref.id)}),
    create(ref,value){if(data.has(ref.id))throw Error('exists');data.set(ref.id,value)},
    update(ref,value){if(!data.has(ref.id))throw Error('missing');data.set(ref.id,{...data.get(ref.id),...value})}
  })};
  return {db,data};
}
const admin={uid:'ADMIN1',admin:true};
test('member create, edit and withdrawal update only the member document; group cannot bypass composition',async()=>{
  const store=memory(),command=createMemberManagementCommand(store.db);
  await command.save({mode:'create',member:{member_id:'M100',member_name:'新規 会員',member_type:'一般',billing_group_id:'G100',joined_date:'2026-10-18'}},admin);
  assert.equal(store.data.get('M100').status,'在籍');
  await command.save({mode:'update',member:{member_id:'M100',member_name:'更新 会員'}},admin);
  assert.equal(store.data.get('M100').billing_group_id,'G100');
  await assert.rejects(command.save({mode:'update',member:{member_id:'M100',billing_group_id:'G200'}},admin),e=>e.code==='INVALID_MEMBER_MANAGEMENT_INPUT');
  await command.withdraw({member_id:'M100',withdrawn_date:'2026-10-31'},admin);
  assert.equal(store.data.get('M100').status,'退会');assert.equal(store.data.size,1);
});
test('member management validates input, identity and admin authorization',async()=>{
  const store=memory({M1:{member_id:'M1'}}),command=createMemberManagementCommand(store.db);
  await assert.rejects(command.save({mode:'create',member:{member_id:'M1',member_name:'A',member_type:'一般',billing_group_id:'G1',joined_date:'2026-10-18'}},admin),e=>e.code==='MEMBER_ALREADY_EXISTS');
  await assert.rejects(command.save({mode:'update',member:{member_id:'M2',member_name:'A'}},admin),e=>e.code==='MEMBER_NOT_FOUND');
  await assert.rejects(command.withdraw({member_id:'M1',withdrawn_date:'bad'},admin),e=>e.code==='INVALID_MEMBER_MANAGEMENT_INPUT');
  await assert.rejects(command.save({mode:'update',member:{member_id:'M1',member_name:'A'}},{uid:'T1'}),e=>e.status===403);
});
function groupMemory(){
  const tables={members:new Map([['M1',{member_id:'M1',member_name:'一',member_type:'一般',billing_group_id:'BG001'}],['M2',{member_id:'M2',member_name:'二',member_type:'一般',billing_group_id:'BG002'}]]),fees:new Map([['P2',{plan_id:'P2',membership_fee_type:'月会費',applicable_member_count:2}],['P1',{plan_id:'P1',membership_fee_type:'月会費',applicable_member_count:1}]]),plan_selection_rules:new Map([['R1',{member_type:'一般',selectable_plan_id:'P1'}],['R2',{member_type:'一般',selectable_plan_id:'P2'}]])};
  const db={collection:name=>({doc:id=>({kind:'doc',name,id}),where:(field,op,value)=>({kind:'query',name,field,value})}),runTransaction:async fn=>fn({
    get:async ref=>ref.kind==='query'?{docs:[...tables[ref.name]].filter(([,v])=>v[ref.field]===ref.value).map(([id,v])=>({id,data:()=>v}))}:{exists:tables[ref.name].has(ref.id),data:()=>tables[ref.name].get(ref.id)},
    update(ref,value){tables[ref.name].set(ref.id,{...tables[ref.name].get(ref.id),...value})}
  })};return {db,tables};
}
test('billing group composition updates selected members only and validates size/type plan boundaries',async()=>{
  const store=groupMemory(),command=createMemberManagementCommand(store.db);
  const result=await command.saveGroup({billing_group_id:'BG003',member_ids:['M1','M2'],membership_fee_type:'月会費',plan_id:'P2',create_new:true},admin);
  assert.equal(result.group_size,2);assert.equal(store.tables.members.get('M1').billing_group_id,'BG003');assert.equal(store.tables.members.get('M2').billing_group_id,'BG003');
  await assert.rejects(command.saveGroup({billing_group_id:'BG004',member_ids:['M1','M2'],membership_fee_type:'月会費',plan_id:'P1',create_new:true},admin),e=>e.code==='MEMBER_GROUP_PLAN_COUNT_MISMATCH');
  const noCandidate=await command.saveGroup({billing_group_id:'BG004',member_ids:['M1','M2'],membership_fee_type:'月会費',plan_id:'',create_new:true},admin);assert.equal(noCandidate.group_size,2);
});
test('WebConnect routes list/save/group/withdraw and API enforces admin before callbacks',async()=>{
  assert.equal(WebConnectCore.resolve('member_management_list',{}).operation,'memberManagement.list');
  assert.equal(WebConnectCore.resolve('member_management_save',{}).operation,'memberManagement.save');
  assert.equal(WebConnectCore.resolve('member_management_group_save',{}).operation,'memberManagement.groupSave');
  const calls=[];
  const api=createAdminApi({verifyIdToken:async token=>({uid:'U1',admin:token==='admin'}),getTimeTravel:async()=>({}),saveTimeTravel:async()=>({}),getSystemContext:async()=>({ok:true,system_now:'2026-10-18 10:00:00',target_month:'2026-10',time_travel_enabled:false}),readMember:async()=>null,readMembers:async()=>[],
    readMemberManagementList:async()=>{calls.push('list');return {ok:true,members:[]}},saveManagedMember:async()=>{calls.push('save');return {ok:true}},saveManagedMemberGroup:async()=>{calls.push('group');return {ok:true}},withdrawManagedMember:async()=>({ok:true})});
  const denied=await api({method:'GET',operation:'memberManagement.list',input:{},authorization:'Bearer teacher'});assert.equal(denied.status,403);assert.equal(calls.length,0);
  const listed=await api({method:'GET',operation:'memberManagement.list',input:{},authorization:'Bearer admin'});assert.equal(listed.status,200);assert.deepEqual(calls,['list']);
  const wrongMethod=await api({method:'GET',operation:'memberManagement.save',input:{},authorization:'Bearer admin'});assert.equal(wrongMethod.status,405);
  const grouped=await api({method:'POST',operation:'memberManagement.groupSave',input:{},authorization:'Bearer admin'});assert.equal(grouped.status,200);assert.deepEqual(calls,['list','group']);
});
test('teacher menu links to member list and UI provides all required transitions with existing auth/session',()=>{
  const home=fs.readFileSync('web/qr/teacher_home.html','utf8'),page=fs.readFileSync('web/qr/member_management.html','utf8');
  assert.match(home,/href="member_management\.html">👥 会員管理/);
  for(const text of ['新規登録','編集','退会','支払グループ'])assert.match(page,new RegExp(text));
  for(const asset of ['virtual_session.js','runtime_config.js','firebase_auth.js','dojo_api_client.js'])assert.match(page,new RegExp(asset.replace('.','\\.')));
  assert.match(page,/member_management_list/);assert.match(page,/member_management_save/);assert.match(page,/member_management_group_save/);assert.match(page,/member_management_withdraw/);assert.match(page,/applicable_member_count/);
  const inline=[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);assert.equal(inline.length,1);assert.doesNotThrow(()=>new vm.Script(inline[0]));
});
