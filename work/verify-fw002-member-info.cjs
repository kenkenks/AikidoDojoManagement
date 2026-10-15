'use strict';
process.env.TZ='Asia/Tokyo';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),cp=require('node:child_process');
const {createBillingMemberInfoReader}=require('../cloud/billing/member-info-firestore.cjs');
const {createAttendanceRegistration}=require('../.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');
const {createAdminApi}=require('../cloud/api/admin-api.cjs'),{createDispatch}=require('../cloud/api/webConnect.cjs');
const month='2026-10',memberId='M1';
function fixtures(){return {members:[{id:'M1',member_id:'M1',member_name:'TEST',billing_group_id:'G1'}],
  invoices:[{id:'I1',invoice_id:'I1',target_month:month,billing_group_id:'G1',member_id:'M1',plan_id:'P1','表示名':'TEST','請求予定額':2000,'金額':2000,'上限金額':3000,'支払状態':'未払い'}],
  payments:[{id:'PAY1',payment_id:'PAY1',target_month:month,billing_group_id:'G1',invoice_id:'I1','入金額':500,'支払方法':'現金'}],
  attendances:[],monthly_selections:[],billing_blocks:[],paymentEvidences:[],payment_status_views:[]};}
function harness(tables=fixtures(),{limit=false,error=false,clock={ok:true,timezone:'Asia/Tokyo',system_now:'2026-10-26 10:30:00',target_month:month}}={}){
  const calls=[];let writes=0;
  const doc=r=>({id:r.id,exists:true,data:()=>{const {id,...data}=r;return data;}});
  const ref=(collection,filters=[],id=null)=>({collection,filters,id,where:(k,_op,v)=>ref(collection,[...filters,[k,v]]),limit:n=>({...ref(collection,filters),n}),doc:key=>ref(collection,[],key)});
  const db={collection:name=>ref(name),runTransaction:async(fn,options)=>{
    assert.equal(options.readOnly,true);
    const tx={get:async q=>{calls.push(q.collection);if(error&&q.collection==='payments')throw Error('offline');
      const rows=(tables[q.collection]||[]).filter(r=>q.filters.every(([k,v])=>r[k]===v));
      if(q.id){const row=rows.find(r=>r.id===q.id);return row?doc(row):{exists:false};}
      return {docs:limit&&q.collection==='invoices'?Array(500).fill(doc(tables.invoices[0])):rows.slice(0,q.n).map(doc)};}};
    for(const method of ['set','create','update','delete'])tx[method]=()=>{writes++;throw Error('WRITE_FORBIDDEN');};
    return fn(tx);
  }};
  return {read:createBillingMemberInfoReader(db,{getSystemContext:async()=>clock,createProjection:createAttendanceRegistration}),tables,calls,get writes(){return writes;}};
}
const plain=v=>JSON.parse(JSON.stringify(v));
function demo(t){
  const s={Job:class{},ensureSheetContext:x=>x,perfLog(){},sup_targetMonth:()=>month,sup_today:()=> '2026-10-26',
    sup_now:()=>new Date('2026-10-26T10:30:00+09:00'),getMembers:()=>t.members.map(m=>({...m,'氏名':m.member_name,'請求グループID':m.billing_group_id})),getInvoices:()=>t.invoices,getPayments:()=>t.payments,
    getAttendances:()=>t.attendances,getPaymentEvidences:()=>t.paymentEvidences,getBillingBlocks:()=>t.billing_blocks,
    daoAttendanceCollectChargeRows_:()=>({attendances:t.attendances,billingBlocks:t.billing_blocks}),
    billing_getMonthlySelection:()=>t.monthly_selections[0]||null,
    paymentEvidence_normalizePaymentMethod_:v=>v==='現金'?'CASH':v==='PayPay'?'PAYPAY':String(v||'').toUpperCase(),
    Session:{getScriptTimeZone:()=> 'Asia/Tokyo'},Utilities:{formatDate:d=>{const date=new Date(d);return new Date(date.getTime()+9*3600000).toISOString().slice(0,10);}}};
  vm.createContext(s);vm.runInContext(fs.readFileSync('gas/01_Commom.js','utf8')+'\n'+fs.readFileSync('gas/04_Attendance.js','utf8')+'\n'+cp.execFileSync('git',['show','origin/demo-20260923:gas/20_PaymentStatusTeacher.js'],{encoding:'utf8'})+'\n'+cp.execFileSync('git',['show','origin/demo-20260923:gas/20_PaymentStatusView.js'],{encoding:'utf8'}),s);
  const facts=s.paymentStatusView_collectContext('M1',month,{});
  return plain(s.paymentStatusView_convertResponse(s.paymentStatusView_buildRow('M1',month,facts),{}));
}
test('FW002 GAS demo DTO parity, complete original sources, no persisted View or writes',async()=>{
  const h=harness();const dto=await h.read(memberId);assert.deepEqual(plain(dto),demo(h.tables));
  assert.equal(dto.billedTotal,2000);assert.equal(dto.paidTotal,500);assert.equal(dto.unpaidAmount,1500);assert.equal(h.writes,0);
});
test('FW002 complete zero invoices is undeclared; selected but no invoice remains explicit no-invoice state',async()=>{
  const t=fixtures();t.invoices=[];t.payments=[];const h=harness(t);
  assert.equal((await h.read(memberId)).status,'未宣言');
  const {monthlySelectionDocumentId}=require('../cloud/attendance/monthly-selection-key.cjs');
  t.monthly_selections=[{id:monthlySelectionDocumentId('G1',month),billing_group_id:'G1',target_month:month,plan_id:'P1'}];
  assert.equal((await h.read(memberId)).status,'請求なし');assert.equal(h.writes,0);
});
test('FW002 valid/stale View is recalculated, corrupted View is rejected',async()=>{
  const s={};vm.createContext(s);vm.runInContext(fs.readFileSync('gas/20_PaymentStatusView.js','utf8'),s);
  const t=fixtures();const view={...plain(s.paymentStatusView_schemaTemplate_()),id:'V1',member_id:'M1',billing_group_id:'G1',target_month:month};
  t.payment_status_views=[view];assert.equal((await harness(t).read(memberId)).billedTotal,2000);
  view['請求額']=1234;assert.equal((await harness(t).read(memberId)).billedTotal,2000);
  view.invoice_items_json='bad';await assert.rejects(harness(t).read(memberId),/INVALID_FEE_VIEW/);
});
test('FW002 cash/PayPay/other and multiple group invoices preserve GAS allocation/DTO',async()=>{
  const t=fixtures();t.invoices.push({...t.invoices[0],id:'I2',invoice_id:'I2',member_id:'M2','請求予定額':1000,'金額':1000});
  t.payments.push({...t.payments[0],id:'PAY2',payment_id:'PAY2',invoice_id:'I2','入金額':200,'支払方法':'PayPay'},
    {...t.payments[0],id:'PAY3',payment_id:'PAY3','入金額':100,'支払方法':'OTHER'});
  const result=await harness(t).read(memberId);assert.deepEqual(plain(result),demo(t));
  assert.equal(result.billedTotal,3000);assert.equal(result.cashPaidTotal,500);assert.equal(result.paypayPaidTotal,200);assert.equal(result.otherPaidTotal,100);
});
test('FW002 missing sources, corrupt amounts, limits and partial failures fail closed',async()=>{
  for(const mutate of [t=>t.members=[],t=>delete t.members[0].billing_group_id,t=>delete t.invoices[0]['請求予定額'],t=>t.payments[0]['入金額']='bad']){
    const t=fixtures();mutate(t);await assert.rejects(harness(t).read(memberId));
  }
  await assert.rejects(harness(fixtures(),{limit:true}).read(memberId),/INCOMPLETE/);
  await assert.rejects(harness(fixtures(),{error:true}).read(memberId),/offline/);
});
test('FW002 target month is SystemContext month independently of business date',async()=>{
  const t=fixtures();const h=harness(t,{clock:{ok:true,timezone:'Asia/Tokyo',system_now:'2026-11-01 10:30:00',target_month:month}});
  assert.equal((await h.read(memberId)).targetMonth,month);
  await assert.rejects(harness(t,{clock:{ok:false}}).read(memberId));
});
test('FW002 verified admin only; 401/403 occur before fee reader, extra params rejected',async()=>{
  let reads=0;const handle=createAdminApi({verifyIdToken:async token=>{if(token==='bad')throw Error();return {uid:'U1',admin:token==='admin'};},
    getTimeTravel:async()=>({}),saveTimeTravel:async()=>{},getSystemContext:async()=>({}),readMember:async()=>null,readMembers:async()=>[],
    readBillingMemberInfo:async id=>{reads++;return {ok:true,memberId:id};}});
  const call=(authorization,input={member_id:'M1'})=>createDispatch(handle)({action:'getMemberInfo',input,context:{authorization}});
  assert.equal((await call()).status,401);assert.equal((await call('Bearer bad')).status,401);
  for(const token of ['member','teacher'])assert.equal((await call('Bearer '+token)).status,403);
  assert.equal((await call('Bearer admin',{member_id:'M1',target_month:'2026-11'})).status,400);assert.equal(reads,0);
  assert.equal((await call('Bearer admin')).status,200);assert.equal(reads,1);
});
test('FW002 cancellation/duplicate slots and today flag match GAS; no mutation methods are available',async()=>{
  const t=fixtures();t.billing_blocks=[{id:'B1',billing_block_id:'B1','1課金あたり枠数':2,'状態':'有効'}];
  t.attendances=[{id:'A1',attendance_id:'A1',member_id:'M1',target_month:month,'稽古日':'2026-10-26',billing_block_id:'B1',slot_id:'S1','状態':'有効'}];
  t.attendances.push({...t.attendances[0],id:'A2',attendance_id:'A2'});
  for(const state of ['有効','取消']){
    for(const row of t.attendances)row['状態']=state;
    const h=harness(t),result=await h.read(memberId);assert.deepEqual(plain(result),demo(t));assert.equal(result.lessonCount,state==='有効'?1:0);assert.equal(h.writes,0);
  }
});
test('FW002 missing evidence invoice, invalid View counters, duplicate View and clock failure are errors',async()=>{
  const t=fixtures();t.paymentEvidences=[{id:'E1',evidence_id:'E1',member_id:'M1',invoice_id:'MISSING',amount:100,status:'CONFIRMED'}];
  await assert.rejects(harness(t).read(memberId));
  const s={};vm.createContext(s);vm.runInContext(fs.readFileSync('gas/20_PaymentStatusView.js','utf8'),s);
  const b=fixtures();const view={...plain(s.paymentStatusView_schemaTemplate_()),id:'V1',member_id:'M1',billing_group_id:'G1',target_month:month};
  b.payment_status_views=[{...view,'請求額':'bad'}];await assert.rejects(harness(b).read(memberId),/INVALID_FEE_VIEW/);
  b.payment_status_views=[view,{...view,id:'V2'}];await assert.rejects(harness(b).read(memberId));
  const invalid=harness(fixtures(),{clock:{ok:true,timezone:'Asia/Tokyo',system_now:'2026-02-30 00:00:00',target_month:month}});
  await assert.rejects(invalid.read(memberId));assert.equal(invalid.calls.length,0);
});
