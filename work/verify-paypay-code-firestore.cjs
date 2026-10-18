'use strict';
const assert=require('node:assert/strict');
const {createPayPayCodeFirestoreExecutor}=require('../cloud/billing/payment-paypay-code-firestore.cjs');
const clone=value=>structuredClone(value);
function fixture(){
  const tables={members:{M1:{member_id:'M1',billing_group_id:'G1'}},invoices:{I1:{invoice_id:'I1',member_id:'M1',billing_group_id:'G1',target_month:'2026-10','請求予定額':1500,'支払状態':'未入金'}},payments:{},paymentEvidences:{}};
  const db={collection(name){return {doc(id){return {name,id}},where(field,op,value){assert.equal(op,'==');return {name,filters:[[field,value]],where(f,o,v){assert.equal(o,'==');this.filters.push([f,v]);return this},limit(n){this.max=n;return this}}}}},async runTransaction(fn){
    const changes=[];let wrote=false;const tx={async get(ref){assert.equal(wrote,false,'read after write');if(ref.id!==undefined){const v=tables[ref.name]?.[ref.id];return {exists:!!v,id:ref.id,data:()=>clone(v)}}const docs=Object.entries(tables[ref.name]||{}).filter(([,v])=>ref.filters.every(([f,x])=>v[f]===x)).map(([id,v])=>({exists:true,id,data:()=>clone(v)}));return {docs}},create(ref,v){wrote=true;changes.push(['create',ref,clone(v)])},update(ref,v){wrote=true;changes.push(['update',ref,clone(v)])}};
    const result=await fn(tx);for(const [op,ref,v]of changes){tables[ref.name]??={};if(op==='create'){assert.equal(tables[ref.name][ref.id],undefined);tables[ref.name][ref.id]=v}else Object.assign(tables[ref.name][ref.id],v)}return result;
  }};
  const createProjection=()=>({calculateInvoiceStatuses(invoices,payments){return invoices.map(i=>{const paid=payments.filter(p=>p.invoice_id===i.invoice_id).reduce((n,p)=>n+p['入金額'],0);return {invoice_id:i.invoice_id,status:paid>=i.amount?'入金済':'未入金',unpaid_amount:Math.max(0,i.amount-paid)}})}});
  const executor=createPayPayCodeFirestoreExecutor(db,{getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',target_month:'2026-10',system_now:'2026-10-18 10:00:00'}),createProjection,serverTimestamp:()=> 'STAMP'});
  const actor={authenticated_uid:'ADMIN',admin:true};
  const request={request_id:'START1',member_id:'M1',reception_date:'2026-10-18'};
  const paymentInfo={ok:true,memberId:'M1',memberName:'会員一',billingGroupId:'G1',targetMonth:'2026-10',planType:'MONTHLY',status:'未入金',unpaidAmount:1500,invoiceItems:[{invoice_id:'I1',amount:1500}],invoiceSummary:'月会費 1500円'};
  return {tables,executor,actor,request,paymentInfo};
}
async function main(){
  const f=fixture();const started=await f.executor.start({request:f.request,actor:f.actor,paymentInfo:f.paymentInfo});
  assert.equal(started.ok,true);assert.equal(started.amount,1500);assert.equal(started.evidenceItems.length,1);assert.equal(started.evidenceItems[0].status,'REQUESTED');
  const again=await f.executor.start({request:{...f.request,request_id:'START2'},actor:f.actor,paymentInfo:f.paymentInfo});assert.equal(again.evidenceItems[0].evidence_id,started.evidenceItems[0].evidence_id);assert.equal(Object.keys(f.tables.paymentEvidences).length,1);
  const recorded=await f.executor.record({request:{request_id:'RECORD1',member_id:'M1',evidence_code:'M1-20261018-1500',evidence_items:[{evidence_id:started.evidenceItems[0].evidence_id}]},actor:f.actor});
  assert.equal(recorded.evidenceItems[0].status,'CONFIRMED');assert.equal(Object.values(f.tables.paymentEvidences)[0].evidence_code,'M1-20261018-1500');
  const replay=await f.executor.record({request:{request_id:'RECORD1',member_id:'M1',evidence_code:'M1-20261018-1500',evidence_items:[{evidence_id:started.evidenceItems[0].evidence_id}]},actor:f.actor});assert.equal(replay.evidenceItems[0].idempotent_replay,true);
  await assert.rejects(()=>f.executor.record({request:{request_id:'RECORD2',member_id:'M1',evidence_code:'OTHER',evidence_items:[{evidence_id:started.evidenceItems[0].evidence_id}]},actor:f.actor}),e=>e.code==='PAYPAY_CODE_ALREADY_CONFIRMED');
  assert.equal(Object.keys(f.tables.payments).length,0,'member-side flow must not post payment');
  console.log('PayPay code Firestore transaction: PASS (start/reuse/record/replay/conflict/no-post)');
}
main().catch(error=>{console.error(error);process.exitCode=1});
