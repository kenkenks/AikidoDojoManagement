'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createAdminApi}=require('../cloud/api/admin-api.cjs');
const {createDispatch}=require('../cloud/api/webConnect.cjs');
const {createFirestoreProgressReader}=require('../cloud/attendance/progress-firestore.cjs');
const {projectAttendanceProgress}=require('../cloud/attendance/progress-summary.cjs');
function api({admin=false,teacher=false,active=true,linked=true,fail=false}={}){
  let reads=0;
  const handle=createAdminApi({verifyIdToken:async t=>{if(t==='bad')throw Error();return {uid:'U1',admin};},
    getSystemContext:async()=>({}),getTimeTravel:async()=>({}),saveTimeTravel:async()=>{throw Error('NO_WRITE');},readMember:async()=>null,readMembers:async()=>[],
    resolveDojoPrincipal:async()=>!linked?null:teacher?{teacher_id:'T1'}:{member_id:'M1'},isActiveTeacher:async()=>active,
    readAttendanceProgressSummary:async id=>{reads++;if(fail)throw Error();return {ok:true,member_id:id};}});
  return {call:(authorization,input={member_id:'M1'})=>createDispatch(handle)({action:'attendance_progress_summary',input,context:{authorization}}),get reads(){return reads;}};
}
test('summary allows own member, admin and existing active teacher model',async()=>{
  for(const options of [{},{admin:true},{teacher:true}]){
    const d=api(options);const id=options.admin||options.teacher?'M2':'M1';
    assert.equal((await d.call('Bearer user',{action:'attendance_progress_summary',member_id:id})).status,200);assert.equal(d.reads,1);
  }
});
test('summary denies unauthenticated, invalid token, other member and unlinked/disabled teacher before reader',async()=>{
  for(const [options,auth,input,status] of [[{},null,{member_id:'M1'},401],[{},'Bearer bad',{member_id:'M1'},401],
    [{},'Bearer user',{member_id:'M2'},403],[{linked:false},'Bearer user',{member_id:'M1'},403],
    [{teacher:true,active:false},'Bearer user',{member_id:'M2'},403]]){
    const d=api(options);assert.equal((await d.call(auth,input)).status,status);assert.equal(d.reads,0);
  }
});
test('summary rejects extra/invalid inputs and fails explicitly on reader failure',async()=>{
  for(const input of [{member_id:'../M1'},{member_id:'M1',teacher_id:'T1'},{}]){
    const d=api({admin:true});assert.equal((await d.call('Bearer user',input)).status,400);assert.equal(d.reads,0);
  }
  assert.equal((await api({fail:true}).call('Bearer user')).status,503);
});
function gasSummary(member,rows,standard){
  const c={Job:class{},ensureSheetContext:x=>x,normalizeId_:v=>String(v??'').trim(),
    examinationStandard_getMap:()=>({R:standard}),rankMaster_getOptionMap:()=>({R:{rank_id:'R1',sort_order:1}}),
    daoMemberGetAll_:()=>[member],getAttendances:()=>rows,
    isActiveMasterRow_:r=>['','有効','在籍','TRUE'].includes(String(r['状態']??'').trim()),
    parseAttendanceDate_:v=>{const s=String(v).trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error();return s;},
    formatAttendanceDate_:v=>v==null||v===''?'':c.parseAttendanceDate_(v)};
  vm.createContext(c);vm.runInContext(fs.readFileSync('gas/04_AttendanceProgress.js','utf8'),c);
  return JSON.parse(JSON.stringify(c.attendanceProgress_getMemberSummary('M1',{})));
}
test('summary matches GAS DTO: start date, distinct slots, cancellation/re-registration, carry, required and recent five',()=>{
  const member={member_id:'M1',member_name:'TEST',status:'有効',current_rank:'R',rank_start_date:'2026-10-02',carried_training_count:'2.9',eligible_training_count:'12.8'};
  const standard={progress_display_enabled:true,required_training_count:20,next_rank:'R2',note:''};
  const rows=Array.from({length:8},(_,i)=>({member_id:'M1','稽古日':'2026-10-0'+(i+1),slot_id:'S1','状態':'有効'}));
  rows.push({...rows[2]},{...rows[2],slot_id:'S2'},{...rows[3],slot_id:'S3','状態':'取消'});
  for(const status of ['有効','取消','有効']){
    rows[4]['状態']=status;
    const result=projectAttendanceProgress({member,attendanceRows:rows,standard,rankOption:{rank_id:'R1',sort_order:1}});
    assert.deepEqual(JSON.parse(JSON.stringify(result)),gasSummary(member,rows,standard));
    assert.equal(result.required_training_count,12);assert.equal(result.carried_training_count,2);assert.equal(result.recent_attendance_dates.length,5);
  }
});
test('summary reader rejects incomplete history and master pagination rather than partial DTO',async()=>{
  const core={readById:async()=>({member_id:'M1',status:'有効'}),queryEqual:async()=>Array(500).fill({}),readPage:async()=>({documents:[]})};
  await assert.rejects(createFirestoreProgressReader(core)('M1'),/INCOMPLETE/);
  core.queryEqual=async()=>[];core.readPage=async()=>({documents:[],nextPageToken:'same'});
  await assert.rejects(createFirestoreProgressReader(core)('M1'),/PAGINATION_LOOP/);
});
test('valid numeric strings, missing dates and zero/standard requirements retain GAS DTO compatibility',()=>{
  for(const carried of ['',0,'3.7'])for(const override of ['',0,'6.9']){
    const member={member_id:'M1',status:'有効',current_rank:'R',rank_start_date:'',carried_training_count:carried,eligible_training_count:override};
    const standard={progress_display_enabled:true,required_training_count:'8.4',next_rank:'R2',note:''};
    const rows=[{member_id:'M1','稽古日':'','状態':'有効'},{member_id:'M1','稽古日':'2026-10-26',slot_id:'','状態':'有効'}];
    assert.deepEqual(JSON.parse(JSON.stringify(projectAttendanceProgress({member,attendanceRows:rows,standard,rankOption:{rank_id:'R1',sort_order:1}}))),gasSummary(member,rows,standard));
  }
});
test('actual summary page uses authenticated GET in Firebase and preserves GAS JSONP branch',async()=>{
  const html=fs.readFileSync('web/qr/attendance_summary.html','utf8'),calls=[];
  const code=html.slice(html.indexOf('    async function readSummary('),html.indexOf('    function renderSummary('));
  const c={URL,GAS_URL:'https://example.invalid',isFirebase:true,summaryAuth:{ready:Promise.resolve(),getCurrentUser:()=>({uid:'U1'})},
    summaryApi:{request:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({ok:true,member_id:'M1'})};}},
    jsonp:async()=>{calls.push('jsonp');return {ok:true};}};
  vm.createContext(c);vm.runInContext(code,c);await c.readSummary('M1');
  assert.equal(calls[0].options.method,'GET');assert.equal(new URL(calls[0].url).pathname,'/api/webconnect');
  assert.equal(new URL(calls[0].url).searchParams.get('action'),'attendance_progress_summary');
  c.summaryAuth.getCurrentUser=()=>null;await assert.rejects(c.readSummary('M1'),/AUTH_REQUIRED/);assert.equal(calls.length,1);
  c.isFirebase=false;await c.readSummary('M1');assert.equal(calls[1],'jsonp');
});
