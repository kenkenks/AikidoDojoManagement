'use strict';
process.env.TZ='Asia/Tokyo';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),cp=require('node:child_process');
const {createReceptionSummaryReader}=require('../cloud/billing/reception-summary-firestore.cjs');
const {createAttendanceRegistration}=require('../.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');
const {createAdminApi}=require('../cloud/api/admin-api.cjs'),{createDispatch}=require('../cloud/api/webConnect.cjs');
const day='2026-10-26',month='2026-10',params={reception_date:day,location_id:'L1',billing_block_id:'B1'};
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){return {dojos:[{id:'L1'}],billing_blocks:[{id:'B1',location_id:'L1'}],
  members:[{id:'M1',member_id:'M1',member_name:'TEST',billing_group_id:'G1'}],
  invoices:[{id:'I1',invoice_id:'I1',target_month:month,billing_group_id:'G1',member_id:'M1',plan_id:'P1','表示名':'TEST','請求予定額':2000,'金額':2000,'支払状態':'未払い'}],
  payments:[{id:'PAY1',payment_id:'PAY1',member_id:'M1',invoice_id:'I1',billing_group_id:'G1',target_month:month,reception_date:day,location_id:'L1',billing_block_id:'B1','日時':day+' 10:30:00','入金額':500,'支払方法':'現金'}],
  attendances:[{id:'A1',attendance_id:'A1',member_id:'M1',target_month:month,'稽古日':day,location_id:'L1',billing_block_id:'B1',slot_id:'S1','状態':'有効'}],paymentEvidences:[],payment_status_views:[]};}
function prepareViews(t){
  const ctx={daoCore:{},timezone:'Asia/Tokyo',settings:{},clock:()=>new Date()};
  const sources=createAttendanceRegistration(ctx,{uuid:()=>''}).projectReceptionSources({invoices:t.invoices.filter(i=>i.target_month===month),payments:t.payments.filter(p=>p.target_month===month),attendances:t.attendances.filter(a=>a.target_month===month)});
  t.payment_status_views=t.members.map(m=>({id:'V_'+m.member_id,target_month:month,member_id:m.member_id,billing_group_id:m.billing_group_id,'会員名':m.member_name,
    invoice_items_json:JSON.stringify(sources.invoices.filter(i=>i.billing_group_id===m.billing_group_id)),
    reception_payments_json:JSON.stringify(sources.payments.filter(p=>p.billing_group_id===m.billing_group_id)),
    attendance_items_json:JSON.stringify(sources.attendances.filter(a=>a.member_id===m.member_id))}));return t;
}
function harness(t=prepareViews(fixture()),{failCollection,limitCollection,systemDay=day}={}){
  let writes=0;const calls=[];const doc=r=>({id:r.id,exists:true,data:()=>{const {id,...fields}=r;return clone(fields);}});
  const ref=(collection,filters=[],id)=>({collection,filters,id,doc:id=>ref(collection,[],id),where:(k,_op,v)=>ref(collection,[...filters,[k,v]]),limit:n=>({...ref(collection,filters),n})});
  const get=async q=>{calls.push(q.collection);if(q.collection===failCollection)throw Error('NETWORK_FAILURE');const rows=(t[q.collection]||[]).filter(r=>q.filters.every(([k,v])=>r[k]===v));
    if(q.id){const r=rows.find(r=>r.id===q.id);return r?doc(r):{exists:false};}
    return {docs:q.collection===limitCollection?Array(500).fill(doc(rows[0]||{id:'LIMIT'})):rows.slice(0,q.n).map(doc)};};
  const db={collection:n=>ref(n),runTransaction:async(fn,options)=>{assert.equal(options.readOnly,true);const tx={get,getAll:async(...refs)=>{calls.push('BULK_MEMBERS');return Promise.all(refs.map(get));}};
    for(const key of ['set','create','update','delete'])tx[key]=()=>{writes++;throw Error('NO_WRITE');};return fn(tx);}};
  return {read:createReceptionSummaryReader(db,{getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',system_now:systemDay+' 10:30:00',target_month:'2026-12'}),createProjection:createAttendanceRegistration}),calls,get writes(){return writes;}};
}
const demoSource=['01_Commom','20_PaymentStatusTeacher','20_PaymentStatusView','06_PaymentReceptionScope'].map(n=>cp.execFileSync('git',['show','origin/demo-20260923:gas/'+n+'.js'],{encoding:'utf8'})).join('\n');
function demo(t,p=params){const s={normalizeId_:v=>String(v??'').trim(),ensureSheetContext:x=>x,getSheetRows:()=>t.payment_status_views,sup_today:()=>day,paymentEvidence_normalizePaymentMethod_:v=>v==='現金'?'CASH':v==='PayPay'?'PAYPAY':String(v||'').toUpperCase()};vm.createContext(s);vm.runInContext(demoSource,s);return clone(s.paymentReception_getScopeSummary(p,{}));}
test('reception new records match full GAS demo DTO and do not write',async()=>{const t=prepareViews(fixture()),h=harness(t);assert.deepEqual(clone(await h.read(params)),demo(t));assert.equal(h.writes,0);assert.equal(h.calls.filter(c=>c==='BULK_MEMBERS').length,1);});
test('legacy member identity resolves from invoice, never View-only identity',async()=>{
  const t=prepareViews(fixture());delete t.payments[0].member_id;assert.deepEqual(clone(await harness(t).read(params)),demo(t));
  delete t.payments[0].invoice_id;await assert.rejects(harness(t).read(params),/MIGRATION_REQUIRED/);
});
test('legacy identity resolves from reciprocally linked posted evidence',async()=>{
  const t=prepareViews(fixture()),p=t.payments[0];delete p.member_id;delete p.invoice_id;p['決済ID']='E1';
  t.paymentEvidences=[{id:'E1',evidence_id:'E1',payment_log_id:'PAY1',invoice_id:'I1',member_id:'M1',amount:500,payment_method:'CASH',status:'POSTED',reception_date:day,location_id:'L1',billing_block_id:'B1'}];
  const view=JSON.parse(t.payment_status_views[0].reception_payments_json);view[0].invoice_id='';t.payment_status_views[0].reception_payments_json=JSON.stringify(view);
  assert.equal((await harness(t).read(params)).payment_count,1);
});
test('conflicting raw payer, evidence or View details fail rather than choose first',async()=>{
  for(const mutate of [t=>t.payments[0].member_id='M2',t=>{const rows=JSON.parse(t.payment_status_views[0].reception_payments_json);rows[0].amount=1;t.payment_status_views[0].reception_payments_json=JSON.stringify(rows);},t=>t.payment_status_views[0].reception_payments_json='bad']){
    const t=prepareViews(fixture());mutate(t);await assert.rejects(harness(t).read(params));
  }
});
test('multiple group members deduplicate invoices/payments and group outstanding once',async()=>{
  const t=fixture();t.members.push({id:'M2',member_id:'M2',member_name:'TEST2',billing_group_id:'G1'});
  t.attendances.push({...t.attendances[0],id:'A2',attendance_id:'A2',member_id:'M2'});prepareViews(t);
  const r=await harness(t).read(params);assert.deepEqual(clone(r),demo(t));assert.equal(r.payment_count,1);assert.equal(r.attendance_member_count,2);assert.equal(r.expected_total,1500);assert.equal(r.outstanding_total,1500);
});
test('method totals and date/dojo/block scope preserve monthly outstanding calculation',async()=>{
  const t=fixture();for(const [id,method,amount,date,location,block]of [['PAY2','PayPay',200,day,'L1','B1'],['PAY3','OTHER',100,day,'L1','B1'],['PAY4','CASH',100,'2026-10-25','L2','B2']])
    t.payments.push({...t.payments[0],id,payment_id:id,'支払方法':method,'入金額':amount,reception_date:date,location_id:location,billing_block_id:block});prepareViews(t);
  const r=await harness(t).read(params);assert.deepEqual(clone(r),demo(t));assert.equal(r.cash_total,500);assert.equal(r.paypay_total,200);assert.equal(r.other_total,100);assert.equal(r.expected_total,1100);
});
test('other target month payments are excluded even when reception day matches',async()=>{
  const t=fixture();t.payments.push({...t.payments[0],id:'OLD',payment_id:'OLD',target_month:'2026-09'});prepareViews(t);
  assert.equal((await harness(t).read(params)).payment_count,1);
});
test('cancelled attendance excluded; paid-without-attendance is a reconciliation exception',async()=>{
  const t=fixture();t.attendances[0]['状態']='取消';prepareViews(t);const r=await harness(t).read(params);
  assert.deepEqual(clone(r),demo(t));assert.equal(r.attendance_member_count,0);assert.equal(r.reconciliation_items[0].status,'PAID_WITHOUT_ATTENDANCE');
});
test('changed membership, missing View population, missing scope require migration',async()=>{
  for(const mutate of [t=>t.members[0].billing_group_id='G2',t=>t.payment_status_views=[],t=>delete t.payments[0].reception_date]){
    const t=prepareViews(fixture());mutate(t);await assert.rejects(harness(t).read(params),/MIGRATION_REQUIRED/);
  }
});
test('default reception date follows TimeTravel business day, not target_month',async()=>{
  const t=prepareViews(fixture());const r=await harness(t).read({location_id:'L1',billing_block_id:'B1'});assert.equal(r.reception_date,day);assert.equal(r.payment_count,1);
});
test('source read limit and partial failure stop, no partial zero result',async()=>{
  await assert.rejects(harness(undefined,{limitCollection:'payments'}).read(params),/INCOMPLETE/);
  await assert.rejects(harness(undefined,{failCollection:'paymentEvidences'}).read(params),/NETWORK_FAILURE/);
});
test('admin authorization precedes reader, and migration/conflict/unavailable are distinct',async()=>{
  let reads=0,failure=null;const handler=createAdminApi({verifyIdToken:async token=>({uid:'U',admin:token==='admin'}),getSystemContext:async()=>({}),getTimeTravel:async()=>({}),saveTimeTravel:async()=>{},readMember:async()=>null,readMembers:async()=>[],
    readPaymentReceptionSummary:async()=>{reads++;if(failure)throw Error(failure);return {ok:true};}});
  const call=authorization=>createDispatch(handler)({action:'payment_reception_summary',input:params,context:{authorization}});
  assert.equal((await call()).status,401);assert.equal((await call('Bearer teacher')).status,403);assert.equal(reads,0);
  assert.equal((await call('Bearer admin')).status,200);
  for(const error of ['RECEPTION_MIGRATION_REQUIRED','RECEPTION_SOURCE_CONFLICT','NETWORK_FAILURE']){failure=error;const r=await call('Bearer admin');assert.equal(r.status,error==='NETWORK_FAILURE'?503:409);assert.equal(r.body.error,error==='NETWORK_FAILURE'?'RECEPTION_READ_UNAVAILABLE':error);}
});
test('same payment across Views must agree; duplicate copies alone do not create extra payments',async()=>{
  const t=fixture();t.members.push({id:'M2',member_id:'M2',member_name:'TEST2',billing_group_id:'G1'});prepareViews(t);
  assert.equal((await harness(t).read(params)).payment_count,1);
  const rows=JSON.parse(t.payment_status_views[1].reception_payments_json);rows[0].member_id='M2';t.payment_status_views[1].reception_payments_json=JSON.stringify(rows);
  await assert.rejects(harness(t).read(params),/SOURCE_CONFLICT/);
});
test('reconstructed identity must agree with evidence invoice, not just evidence payer',async()=>{
  const t=prepareViews(fixture()),p=t.payments[0];delete p.member_id;delete p.invoice_id;p['決済ID']='E1';
  t.paymentEvidences=[{id:'E1',evidence_id:'E1',payment_log_id:'PAY1',invoice_id:'MISSING',member_id:'M1',amount:500,payment_method:'CASH',status:'POSTED',reception_date:day,location_id:'L1',billing_block_id:'B1'}];
  await assert.rejects(harness(t).read(params),/SOURCE_CONFLICT/);
});
test('truly empty View/source scope matches empty GAS DTO',async()=>{
  const t=fixture();t.payment_status_views=[];t.payments=[];t.invoices=[];t.attendances=[];
  assert.deepEqual(clone(await harness(t).read(params)),demo(t));
});
