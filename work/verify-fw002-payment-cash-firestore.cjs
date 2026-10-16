'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createPaymentCashAcceptFirestoreExecutor}=require('../cloud/billing/payment-cash-accept-firestore.cjs');
const {createPaymentCashAcceptCommand}=require('../cloud/billing/payment-cash-accept-command.cjs');
const {createAttendanceRegistration}=require('../.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');
const {createBillingMemberInfoReader}=require('../cloud/billing/member-info-firestore.cjs');

const clone=value=>structuredClone(value);
function ref(collection,filters=[],id=null){return {collection,filters,id,
  doc:key=>ref(collection,[],key),where:(key,_op,value)=>ref(collection,[...filters,[key,value]]),
  limit:n=>({...ref(collection,filters,id),limitValue:n})};}
function memoryDb(seed,{retryOnce=false,beforeCommit=null,failCommit=false}={}){
  const tables=clone(seed);let attempts=0;
  const db={collection:name=>ref(name),async runTransaction(fn){
    for(;;){attempts++;const writes=[];
      const docSnapshot=(collection,id)=>{const row=(tables[collection]||{})[id];return {id,exists:row!==undefined,data:()=>clone(row)};};
      const tx={async get(target){
        if(target.id!==null)return docSnapshot(target.collection,target.id);
        const rows=Object.entries(tables[target.collection]||{}).filter(([,row])=>target.filters.every(([k,v])=>row[k]===v));
        return {docs:rows.slice(0,target.limitValue).map(([id])=>docSnapshot(target.collection,id))};
      },create(target,value){writes.push(['create',target,clone(value)]);},
      update(target,value){writes.push(['update',target,clone(value)]);}};
      const result=await fn(tx);
      if(beforeCommit)await beforeCommit({attempt:attempts,tables,writes});
      if(retryOnce&&attempts===1)continue;
      if(failCommit)throw Error('MOCK_COMMIT_FAILED');
      const next=clone(tables);
      for(const [kind,target,value]of writes){
        next[target.collection]||={};
        if(kind==='create'&&next[target.collection][target.id]!==undefined)throw Error('ALREADY_EXISTS');
        if(kind==='update'&&next[target.collection][target.id]===undefined)throw Error('NOT_FOUND');
        next[target.collection][target.id]=kind==='update'?{...next[target.collection][target.id],...value}:value;
      }
      for(const key of Object.keys(tables))delete tables[key];Object.assign(tables,next);return result;
    }
  }};
  return {db,tables,get attempts(){return attempts;}};
}
function seed(){return {
  members:{M1:{member_id:'M1',member_name:'Member 1',billing_group_id:'G1'}},
  dojos:{L1:{location_id:'L1',status:'有効'}},billing_blocks:{B1:{billing_block_id:'B1',location_id:'L1',status:'有効','1課金あたり枠数':2}},
  invoices:{I1:{invoice_id:'I1',target_month:'2026-10',billing_group_id:'G1',member_id:'M1',plan_id:'P1','表示名':'A','請求予定額':2000,'金額':2000,'上限金額':3000,'支払状態':'未払い'},
    I2:{invoice_id:'I2',target_month:'2026-10',billing_group_id:'G1',member_id:'M2',plan_id:'P1','表示名':'B','請求予定額':1000,'金額':1000,'上限金額':3000,'支払状態':'未払い'}},
  payments:{P0:{payment_id:'P0',target_month:'2026-10',billing_group_id:'G1',invoice_id:'I1',member_id:'M1','入金額':500,'支払方法':'現金'}},
  paymentEvidences:{},payment_cash_requests:{},attendances:{},monthly_selections:{},payment_status_views:{}
};}
const clock={ok:true,timezone:'Asia/Tokyo',system_now:'2026-10-16 19:30:00',target_month:'2026-10'};
const projection=(ctx={daoCore:{},timezone:'Asia/Tokyo',cache:{}},dependencies={})=>
  createAttendanceRegistration(ctx,{uuid:()=>{throw Error('UUID_FORBIDDEN');},...dependencies});
function request(id='REQ-1'){return {request_id:id,location_id:'L1',billing_block_id:'B1',reception_session_id:'S1',items:[{member_id:'M1',billing_group_id:'G1'}]};}
function command(h,context=clock){const executeAtomic=createPaymentCashAcceptFirestoreExecutor(h.db,{getSystemContext:async()=>context,
  createProjection:projection,serverTimestamp:()=>({__serverTimestamp:true})});return createPaymentCashAcceptCommand({executeAtomic});}
const admin={uid:'ADMIN1',admin:true};

test('Step 10C-2 atomically accepts all remaining balances and creates invoice-specific records',async()=>{
  const h=memoryDb(seed()),result=await command(h).execute(request(),admin);
  assert.equal(result.accepted_amount,2500);assert.equal(result.payments.length,2);assert.equal(result.idempotent_replay,false);
  assert.equal(Object.keys(h.tables.payments).length,3);assert.equal(Object.keys(h.tables.paymentEvidences).length,2);
  for(const row of result.payments){
    assert.equal(h.tables.payments[row.payment_id].invoice_id,row.invoice_id);
    assert.equal(h.tables.paymentEvidences[row.evidence_id].status,'POSTED');
    assert.equal(h.tables.invoices[row.invoice_id]['支払状態'],'支払済');
  }
  assert.equal(h.tables.payment_cash_requests['REQ-1'].status,'COMPLETED');
  assert.equal(h.tables.payment_status_views&&Object.keys(h.tables.payment_status_views).length,0);
});

test('Step 10C-2 rejects paid/zero balances without writes',async()=>{
  for(const change of ['paid','zero']){const data=seed();
    if(change==='paid'){data.payments.P1={...data.payments.P0,payment_id:'P1','入金額':1500};data.payments.P2={...data.payments.P0,payment_id:'P2',invoice_id:'I2',member_id:'M2','入金額':1000};}
    else {data.invoices.I1['請求予定額']=data.invoices.I1['金額']=500;data.invoices.I2['請求予定額']=data.invoices.I2['金額']=0;}
    const h=memoryDb(data);await assert.rejects(command(h).execute(request(),admin),/PAYMENT_CASH_NOTHING_DUE/);
    assert.equal(Object.keys(h.tables.payment_cash_requests).length,0);
  }
});

test('Step 10C-2 replays same request and conflicts on changed input or actor',async()=>{
  const h=memoryDb(seed()),c=command(h),first=await c.execute(request(),admin),count=Object.keys(h.tables.payments).length;
  const replay=await c.execute(request(),admin);assert.equal(replay.idempotent_replay,true);
  assert.deepEqual(replay.payments,first.payments);assert.equal(Object.keys(h.tables.payments).length,count);
  await assert.rejects(c.execute({...request(),reception_session_id:'S2'},admin),/PAYMENT_CASH_REQUEST_CONFLICT/);
  await assert.rejects(c.execute(request(),{uid:'ADMIN2',admin:true}),/PAYMENT_CASH_REQUEST_CONFLICT/);
});

test('Step 10C-2 transaction retry uses stable IDs and commits once',async()=>{
  const h=memoryDb(seed(),{retryOnce:true}),result=await command(h).execute(request('RETRY-1'),admin);
  assert.equal(h.attempts,2);assert.equal(result.payments.length,2);
  assert.equal(new Set(result.payments.map(x=>x.payment_id)).size,2);
  assert.equal(Object.keys(h.tables.payments).length,3);assert.equal(Object.keys(h.tables.paymentEvidences).length,2);
});

test('Step 10C-2 concurrent competing receipt is recalculated and cannot double-collect',async()=>{
  let injected=false;const h=memoryDb(seed(),{retryOnce:true,beforeCommit:async({attempt,tables})=>{
    if(attempt!==1||injected)return;injected=true;
    tables.payments.EXTERNAL1={payment_id:'EXTERNAL1',target_month:'2026-10',billing_group_id:'G1',invoice_id:'I1',member_id:'M1','入金額':1500,'支払方法':'現金'};
    tables.payments.EXTERNAL2={payment_id:'EXTERNAL2',target_month:'2026-10',billing_group_id:'G1',invoice_id:'I2',member_id:'M2','入金額':1000,'支払方法':'現金'};
    tables.invoices.I1['支払状態']='支払済';tables.invoices.I2['支払状態']='支払済';
  }});
  await assert.rejects(command(h).execute(request('LOSER-1'),admin),/PAYMENT_CASH_NOTHING_DUE/);
  assert.equal(Object.keys(h.tables.payment_cash_requests).length,0);
  assert.equal(Object.keys(h.tables.paymentEvidences).length,0);
});

test('Step 10C-2 failed commit leaves no partial evidence, payment, invoice or request writes',async()=>{
  const data=seed(),before=clone(data),h=memoryDb(data,{failCommit:true});
  await assert.rejects(command(h).execute(request('FAIL-1'),admin),/MOCK_COMMIT_FAILED/);
  assert.deepEqual(h.tables,before);
});

test('Step 10C-2 separates TimeTrip business time from server audit timestamp',async()=>{
  const context={...clock,system_now:'2025-04-03 09:15:00',target_month:'2026-10'};
  const h=memoryDb(seed()),result=await command(h,context).execute(request('TIME-1'),admin);
  const payment=h.tables.payments[result.payments[0].payment_id];
  assert.equal(payment['日時'],'2025-04-03 09:15:00');assert.equal(payment.reception_date,'2025-04-03');
  assert.deepEqual(payment.recorded_at,{__serverTimestamp:true});
  assert.equal(h.tables.payment_cash_requests['TIME-1'].business_datetime,'2025-04-03 09:15:00');
});

test('Step 10C-2 result remains consistent with existing member Reader without persisted View',async()=>{
  const h=memoryDb(seed());await command(h).execute(request('READ-1'),admin);
  const reader=createBillingMemberInfoReader(h.db,{getSystemContext:async()=>clock,createProjection:projection});
  const dto=await reader('M1');assert.equal(dto.billedTotal,3000);assert.equal(dto.paidTotal,3000);
  assert.equal(dto.unpaidAmount,0);assert.equal(dto.status,'支払済');assert.equal(Object.keys(h.tables.payment_status_views).length,0);
});

test('Step 10C-3 existing persisted View remains advisory and Reader recomputes after cash acceptance',async()=>{
  const data=seed(),sandbox={};vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('gas/20_PaymentStatusView.js','utf8'),sandbox);
  data.payment_status_views.V1={...structuredClone(sandbox.paymentStatusView_schemaTemplate_()),
    member_id:'M1',billing_group_id:'G1',target_month:'2026-10'};
  const h=memoryDb(data);await command(h).execute(request('VIEW-1'),admin);
  const reader=createBillingMemberInfoReader(h.db,{getSystemContext:async()=>clock,createProjection:projection});
  const dto=await reader('M1');assert.equal(dto.unpaidAmount,0);assert.equal(dto.status,'支払済');
  assert.equal(Object.keys(h.tables.payment_status_views).length,1);
});
