'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const bundle=require('../.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');
const {createTeacherTodayReader}=require('../cloud/attendance/teacher-today-firestore.cjs');
const {createAdminApi}=require('../cloud/api/admin-api.cjs');
const {createDispatch}=require('../cloud/api/webConnect.cjs');
const date='2026-10-26',params={location_id:'L1',billing_block_id:'B1',attendance_date:date};
function sessionPage(){
  const html=fs.readFileSync('web/qr/attendanceCheck.html','utf8'),requests=[],nodes=new Map(),choices=[];
  const functions=html.slice(html.indexOf('    function loadAttendanceSessionInfo()'),html.indexOf('    function renderBlockChoices('))+
    html.slice(html.indexOf('    function selectBillingBlock('),html.indexOf('    function loadTeacherAttendanceOverview('));
  const listener=/window.addEventListener\("dojo-system-context", function\(\) \{([\s\S]*?)\n    \}\);/.exec(html)[1];
  const ctx={IS_FIREBASE_ATTENDANCE:true,GAS_URL:'https://example.invalid',currentLocationId:'L1',currentBillingBlockId:'',currentSlots:[],sessionInfoRequestSeq:0,overviewClockKey:'',submitting:false,
    document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}},
    currentAttendanceDate:()=>date,persistAttendanceContext(){},clearCandidates(){},renderCandidates(){},updateSendButton(){},renderKeys(){},setKey(){},addLog(){},loadTeacherAttendanceOverview(){},
    renderBlockChoices:(...args)=>choices.push(args),
    jsonp:(_url,p)=>new Promise((resolve,reject)=>requests.push({params:JSON.parse(JSON.stringify(p)),resolve,reject}))};
  ctx.window={DOJO_SYSTEM_CONTEXT:{time_travel_enabled:true,system_now:date+' 10:30:00',target_month:'2026-10'}};
  vm.createContext(ctx);vm.runInContext(functions+'\nfunction onClock(){'+listener+'}',ctx);
  const response=(id)=>({ok:true,location_id:'L1',location_name:'TEST',requires_selection:false,billing_block_id:id,billing_block_name:id,inferred:true,slots:[{slot_id:'S1'}],billing_block_candidates:[{billing_block_id:id}]});
  return {ctx,requests,nodes,choices,response,run:s=>vm.runInContext(s,ctx),settle:()=>new Promise(r=>setImmediate(r))};
}
test('teacher initialization clock event selects Monday morning and renders selected option',async()=>{
  const p=sessionPage();p.run('onClock()');assert.equal(p.requests.length,1);assert.equal(p.requests[0].params.billing_block_id,undefined);
  p.requests[0].resolve(p.response('AM'));await p.settle();assert.equal(p.ctx.currentBillingBlockId,'AM');assert.equal(p.nodes.get('billingBlockId').className,'ok');
  assert.equal(p.choices.at(-1)[1],'AM');assert.equal(p.choices.at(-1)[2],true);
});
test('TimeTravel change clears old block for automatic selection; manual reselection remains explicit',async()=>{
  const p=sessionPage();p.run('onClock()');p.requests[0].resolve(p.response('AM'));await p.settle();
  p.ctx.window.DOJO_SYSTEM_CONTEXT.system_now=date+' 19:30:00';p.run('onClock()');assert.equal(p.requests[1].params.billing_block_id,undefined);
  p.requests[1].resolve(p.response('PM'));await p.settle();assert.equal(p.ctx.currentBillingBlockId,'PM');
  p.run("selectBillingBlock('AM')");assert.equal(p.requests[2].params.billing_block_id,'AM');
  p.requests[2].resolve({...p.response('AM'),inferred:false});await p.settle();assert.equal(p.ctx.currentBillingBlockId,'AM');
});
test('late initialization/clock responses and errors cannot overwrite newer Firebase selection',async()=>{
  for(const lateError of [false,true]){
    const p=sessionPage();p.run('onClock()');p.ctx.window.DOJO_SYSTEM_CONTEXT.system_now=date+' 19:30:00';p.run('onClock()');
    p.requests[1].resolve(p.response('PM'));await p.settle();
    if(lateError)p.requests[0].reject(Error('old error'));else p.requests[0].resolve({ok:true,requires_selection:true,billing_block_candidates:[]});
    await p.settle();assert.equal(p.ctx.currentBillingBlockId,'PM');assert.equal(p.ctx.currentSlots.length,1);assert.equal(p.choices.length,1);
  }
});
const row=(member,slot,status='有効',extra={})=>({member_id:member,slot_id:slot,'状態':status,'稽古日':date,location_id:'L1',billing_block_id:'B1',...extra});
const summary={M1:{member_name:'TEST',current_rank:'初段',rank_sort_order:1,training_count:2,required_training_count:10,remaining_training_count:8}};
function gas(rows,summaries){
  const sandbox={Job:class{},ensureSheetContext:x=>x,daoContext_:x=>x,daoCore_:()=>({readAttendanceScopeRows:()=>rows}),
    normalizeId_:v=>String(v??'').trim(),parseAttendanceDate_:v=>v||date,formatAttendanceDate_:v=>String(v||date).slice(0,10),
    attendanceProgress_getMemberSummaries:()=>summaries};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('gas/DAO_Business_Attendance.js','utf8')+'\n'+fs.readFileSync('gas/04_AttendanceTeacher.js','utf8')+'\nfunction attendanceCore_findRowsForScope_(p,c){return daoAttendanceFindRowsForScope_(p,c);}',sandbox);
  return sandbox;
}
test('overview DTO and date/dojo/block/cancel filtering match actual GAS source',()=>{
  const rows=[row('M1','S1'),row('M1','S1'),row('M1','S2','確認待ち'),row('M2','S1','取消'),
    row('M3','S1','有効',{location_id:'OTHER'}),row('M4','S1','有効',{'稽古日':'2026-10-25'}),row('M5','S1','有効',{billing_block_id:'B2'})];
  for(const p of [params,{...params,billing_block_id:''}]){
    const actual=bundle.createTeacherAttendanceOverview({rows,summaries:summary,date})(p);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(gas(rows,summary).attendanceTeacherGetTodayOverview(p,{}))));
  }
});
test('registered/cancelled/re-registered facts change overview without changing identifiers',()=>{
  const r=row('M1','S1');const read=()=>bundle.createTeacherAttendanceOverview({rows:[r],summaries:summary,date})(params);
  assert.equal(read().member_count,1);r['状態']='取消';assert.equal(read().member_count,0);
  r['状態']='有効';assert.equal(read().member_count,1);assert.deepEqual(read().attendance_items[0].slot_ids,['S1']);
});
test('Firestore reader uses business date, bounded scope query and existing progress reader; no writes',async()=>{
  const rows=[row('M1','S1')],calls=[];
  const core={queryEqual:async(s,f)=>{calls.push(f);return rows;},readById:async()=>({member_id:'M1',member_name:'TEST',status:'有効'}),readPage:async()=>({documents:[],nextPageToken:null})};
  const read=createTeacherTodayReader(core,{getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',system_now:date+' 10:30:00'}),createOverview:bundle.createTeacherAttendanceOverview});
  const result=await read({location_id:'L1',billing_block_id:'B1'});assert.equal(result.attendance_date,date);assert.equal(result.member_count,1);
  assert(calls[0].some(f=>f.field==='稽古日'&&f.value===date));
  await assert.rejects(read({...params,attendance_date:'2026-02-30'}),/INVALID_ATTENDANCE_DATE/);
  const limited=createTeacherTodayReader({...core,queryEqual:async()=>Array(500).fill(rows[0])},{getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',system_now:date+' 10:30:00'}),createOverview:bundle.createTeacherAttendanceOverview});
  await assert.rejects(limited(params),/SCOPE_LIMIT/);
});
function dispatch({teacher=false,active=true,admin=false,readError=false}={}){
  let reads=0;
  const handle=createAdminApi({verifyIdToken:async token=>{if(token==='bad')throw Error('expired');return {uid:'U1',admin};},
    getSystemContext:async()=>({}),getTimeTravel:async()=>({}),saveTimeTravel:async()=>{throw Error('NO_WRITE');},readMember:async()=>({}),readMembers:async()=>[],
    resolveDojoPrincipal:async()=>teacher?{teacher_id:'T1'}:{member_id:'M1'},isActiveTeacher:async()=>active,
    readTeacherAttendanceToday:async()=>{reads++;if(readError)throw Error('offline');return {ok:true,member_count:0,attendance_items:[]};},
    readMemberAttendanceState:async()=>{reads++;return {ok:true};}});
  const call=(authorization,input=params,action='teacher_attendance_today')=>createDispatch(handle)({action,input,context:{authorization}});
  return {call,get reads(){return reads;}};
}
test('teacher overview requires verified active linked teacher or admin before any DAO reads',async()=>{
  for(const options of [{},{teacher:true,active:false}]){const d=dispatch(options);assert.equal((await d.call('Bearer user')).status,403);assert.equal(d.reads,0);}
  const d=dispatch({teacher:true});assert.equal((await d.call()).status,401);assert.equal((await d.call('Bearer bad')).status,401);assert.equal(d.reads,0);
  assert.equal((await d.call('Bearer user')).status,200);assert.equal((await dispatch({admin:true}).call('Bearer admin')).status,200);
});
test('virtual teacher or extra parameters cannot grant rights; active teacher may read another member',async()=>{
  const d=dispatch();assert.equal((await d.call('Bearer user',{...params,teacher_id:'T1'})).status,403);assert.equal(d.reads,0);
  const t=dispatch({teacher:true});assert.equal((await t.call('Bearer user',{...params,teacher_id:'T1'})).status,400);
  assert.equal((await t.call('Bearer user',{...params,member_id:'M2'},'member_attendance_state')).status,200);
  assert.equal((await d.call('Bearer user',{...params,member_id:'M2'},'member_attendance_state')).status,403);
  assert.equal((await dispatch({teacher:true,readError:true}).call('Bearer user')).status,503);
});
test('actual teacher page sends Firebase register/cancel/re-register then full GET readback and overview, never post_receipt',async()=>{
  const html=fs.readFileSync('web/qr/attendanceCheck.html','utf8');
  const body=html.slice(html.indexOf('    function sendCandidatesToGas()'),html.indexOf('    function postJsonViaForm('));
  const calls=[],ctx={IS_FIREBASE_ATTENDANCE:true,submitting:false,currentTeacherId:'T1',currentLocationId:'L1',currentBillingBlockId:'B1',attendanceSessionId:'SESSION',overviewClockKey:'',
    memberCandidates:[{member_id:'M1',loaded:true,current_rank:'初段',slot_ids:['S1'],billing_plan_id:'P1',billing_plan_selected:true}],
    currentAttendanceDate:()=>date,renderCandidates(){},updateSendButton(){},addLog(){},firebaseAttendanceAuth:{},firebaseAttendanceApi:{},
    postJsonViaForm(){throw Error('NO_GAS');},waitForPostReceipt(){throw Error('NO_RECEIPT');},
    refreshAllMemberStates:async()=>{calls.push('GET state');return true;},loadTeacherAttendanceOverview:async()=>{calls.push('GET overview');return true;}};
  ctx.window={DOJO_RUNTIME_CONFIG:{},DOJO_ATTENDANCE_FIREBASE_WRITE:{register:async({input})=>calls.push(input.attendance_items[0].slot_ids.slice())}};
  vm.createContext(ctx);vm.runInContext(body,ctx);
  for(const slots of [['S1'],[],['S1']]){ctx.memberCandidates[0].slot_ids=slots;vm.runInContext('sendCandidatesToGas()',ctx);await new Promise(r=>setImmediate(r));assert.equal(ctx.submitting,false);}
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['S1'],'GET state','GET overview',[],'GET state','GET overview',['S1'],'GET state','GET overview']);
  ctx.window.DOJO_ATTENDANCE_FIREBASE_WRITE.register=async()=>{throw Error('403');};calls.length=0;vm.runInContext('sendCandidatesToGas()',ctx);await new Promise(r=>setImmediate(r));assert.deepEqual(calls,[]);assert.equal(ctx.submitting,false);
});
