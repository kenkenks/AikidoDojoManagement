'use strict';
process.env.TZ='Asia/Tokyo';
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),vm=require('node:vm');
const {createPaymentScreenReader,requestedInstant}=require('../cloud/billing/payment-screen-firestore.cjs');
const {createAttendanceRegistration}=require('../.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');
const {createAdminApi}=require('../cloud/api/admin-api.cjs'),{createDispatch}=require('../cloud/api/webConnect.cjs');
const params={reception_date:'2026-10-26',location_id:'L1',billing_block_id:'B1',target_month:'2026-11',payment_method:'PAYPAY'};
const plain=v=>JSON.parse(JSON.stringify(v));
function fixtures(){
  const evidence=(id,status,date)=>({id,evidence_id:id,invoice_id:'I1',member_id:'M1',billing_group_id:'G1',status,payment_method:'PAYPAY',amount:500,
    requested_at:date,confirmed_at:'2026/10/25 10:00:00',posted_at:status==='POSTED'?'2026/10/26 10:00:00':'',payment_log_id:status==='POSTED'?'PAY1':'',
    reception_date:'2026-10-25',location_id:'OTHER',billing_block_id:'OTHER',evidence_code:'TEST_CODE',remarks:''});
  return {dojos:[{id:'L1'}],billing_blocks:[{id:'B1',location_id:'L1'}],members:[{id:'M1',member_id:'M1',member_name:'TEST',billing_group_id:'G1'}],
    invoices:[{id:'I1',invoice_id:'I1',target_month:'2026-11',member_id:'M1',billing_group_id:'G1',plan_id:'P1','表示名':'TEST','請求予定額':1000,'金額':1000}],
    payments:[],attendances:[],payment_status_views:[],paymentEvidences:[evidence('E_Z','CONFIRMED','2026/10/26 10:00:00'),evidence('E_A','CONFIRMED','2026-10-26T01:00:00Z'),evidence('E_P','POSTED','2026/10/27 10:00:00')]};
}
function harness(t=fixtures(),{limit,error}={}){
  const calls=[];let transactions=0,writes=0;
  const ref=(name,filters=[],id)=>({name,filters,id,doc:id=>ref(name,[],id),where:(key,_op,value)=>ref(name,[...filters,[key,value]]),limit:n=>({...ref(name,filters),n})});
  const doc=row=>({id:row.id,exists:true,data:()=>{const {id,...data}=row;return {...data};}});
  const get=async q=>{calls.push(q.name);if(error===q.name)throw Error('READ_ERROR');const rows=(t[q.name]||[]).filter(r=>q.filters.every(([k,v])=>r[k]===v));
    if(q.id){const r=rows.find(r=>r.id===q.id);return r?doc(r):{exists:false};}
    return {docs:limit===q.name?Array(500).fill(doc(rows[0]||{id:'LIMIT'})):rows.slice(0,q.n).map(doc)};};
  const db={collection:name=>ref(name),runTransaction:async(fn,options)=>{transactions++;assert.equal(options.readOnly,true);const tx={get,getAll:(...refs)=>Promise.all(refs.map(get))};
    for(const key of ['set','create','update','delete'])tx[key]=()=>{writes++;throw Error('NO_WRITES');};return fn(tx);}};
  return {read:createPaymentScreenReader(db,{getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',system_now:'2026-10-26 10:30:00',target_month:'2026-11'}),createProjection:createAttendanceRegistration}),calls,get writes(){return writes;},get transactions(){return transactions;}};
}
const demoCode=cp.execFileSync('git',['show','origin/demo-20260923:gas/09_PaymentEvidenceQuery.js'],{encoding:'utf8'});
function demo(t,status){const s={normalizeId_:v=>String(v??'').trim(),normalizeMonth:v=>String(v??'').trim(),paymentEvidence_normalizePaymentMethod_:v=>String(v).toUpperCase(),paymentEvidence_toDisplayPaymentMethod_:()=> 'PayPay'};
  vm.createContext(s);vm.runInContext(demoCode,s);return plain(s.paymentEvidenceQuery_listFromReadModel_({target_month:'2026-11',statuses:status,payment_method:'PAYPAY'},
    {invoicesById:{I1:t.invoices[0]},memberNames:{M1:'TEST'},evidences:t.paymentEvidences}));}
test('screen GAS DTO parity except approved requested_at DESC, evidence_id ASC ordering',async()=>{
  const t=fixtures(),h=harness(t),r=await h.read(params);const confirmed=demo(t,'CONFIRMED');confirmed.evidences.reverse();
  assert.deepEqual(plain(r.confirmed),confirmed);assert.deepEqual(plain(r.posted),demo(t,'POSTED'));
  assert.deepEqual(Object.keys(r),['ok','summary','confirmed','posted']);assert.equal(h.transactions,1);assert.equal(h.writes,0);
});
test('existing reception Reader integration preserves scope checks and source mismatch errors',async()=>{
  const t=fixtures();t.payments.push({id:'PAY_BAD',payment_id:'PAY_BAD',target_month:'2026-10',reception_date:'2026-10-26',location_id:'L1',billing_block_id:'B1',billing_group_id:'G1'});
  await assert.rejects(harness(t).read(params),/RECEPTION_MIGRATION_REQUIRED/);
});
test('evidence lists ignore reception date/dojo/block while summary uses them; independent target month',async()=>{
  const r=await harness().read(params);assert.equal(r.summary.reception_date,'2026-10-26');assert.equal(r.summary.location_id,'L1');
  assert.equal(r.confirmed.target_month,'2026-11');assert.equal(r.confirmed.count,2);assert.equal(r.posted.count,1);
  assert(r.confirmed.evidences.every(e=>e.location_id==='OTHER'&&e.reception_date==='2026-10-25'));
  const empty=await harness().read({...params,target_month:'2026-12'});assert.equal(empty.confirmed.count,0);assert.equal(empty.posted.count,0);
});
test('default month and method follow GAS defaults, explicit CASH filters both lists',async()=>{
  const h=harness();assert.equal((await h.read({location_id:'L1',billing_block_id:'B1'})).confirmed.count,2);
  const t=fixtures();t.paymentEvidences[0].payment_method='CASH';const r=await harness(t).read({...params,payment_method:'現金'});
  assert.equal(r.confirmed.count,1);assert.equal(r.posted.count,0);
});
test('Timestamp, Date and zone-less strings sort by absolute requested time; ties use lexical ID',async()=>{
  const t=fixtures();t.paymentEvidences[0].requested_at={seconds:Math.floor(Date.parse('2026-10-26T01:00:00Z')/1000),nanoseconds:1};
  t.paymentEvidences[1].requested_at=new Date('2026-10-26T01:00:00Z');const r=await harness(t).read(params);
  assert.deepEqual(r.confirmed.evidences.map(e=>e.evidence_id),['E_Z','E_A']);
  assert.equal(requestedInstant('2026/10/26 10:00:00').nanos,requestedInstant('2026-10-26T01:00:00Z').nanos);
});
test('requested time reversal under TimeTravel is sorted by requested time, never confirmation/posting time',async()=>{
  const t=fixtures();t.paymentEvidences[0].requested_at='2026/10/24 10:00:00';t.paymentEvidences[0].confirmed_at='2026/10/29 10:00:00';
  assert.deepEqual((await harness(t).read(params)).confirmed.evidences.map(e=>e.evidence_id),['E_A','E_Z']);
});
test('missing/malformed requested time fails without fallback; calendar/zone errors rejected',async()=>{
  for(const value of [undefined,'','bad','2026-02-30 10:00:00','2026-10-26T25:00:00Z','2026-10-26T10:00:00+15:00']){
    const t=fixtures();t.paymentEvidences[0].requested_at=value;await assert.rejects(harness(t).read(params),/INVALID/);
  }
});
test('incomplete reads, missing invoices/member, identity conflicts and invalid state facts fail closed',async()=>{
  await assert.rejects(harness(undefined,{limit:'paymentEvidences'}).read(params),/INCOMPLETE/);
  await assert.rejects(harness(undefined,{error:'paymentEvidences'}).read(params),/READ_ERROR/);
  for(const mutate of [t=>t.invoices=[],t=>t.members=[],t=>t.paymentEvidences[0].member_id='M2',t=>t.paymentEvidences[0].posted_at='2026/10/26 10:00:00',t=>t.paymentEvidences[0].evidence_id='WRONG']){
    const t=fixtures();mutate(t);await assert.rejects(harness(t).read(params));
  }
});
test('verified admin only, no reader before 401/403; invalid params rejected and reader failures stop',async()=>{
  let reads=0;const handler=createAdminApi({verifyIdToken:async token=>({uid:'U',admin:token==='admin'}),getSystemContext:async()=>({}),getTimeTravel:async()=>({}),saveTimeTravel:async()=>{},readMember:async()=>null,readMembers:async()=>[],
    readPaymentScreen:async()=>{reads++;return {ok:true};}});
  const call=(authorization,input=params)=>createDispatch(handler)({action:'payment_screen_read',input,context:{authorization}});
  assert.equal((await call()).status,401);assert.equal((await call('Bearer teacher')).status,403);assert.equal(reads,0);
  assert.equal((await call('Bearer admin',{...params,teacher_id:'T'})).status,400);assert.equal(reads,0);
  assert.equal((await call('Bearer admin')).status,200);assert.equal(reads,1);
});
