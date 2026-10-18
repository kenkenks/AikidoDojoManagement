'use strict';
const assert=require('node:assert/strict');
const {createPayPayPostFirestoreExecutor}=require('../cloud/billing/payment-paypay-post-firestore.cjs');
const clone=x=>structuredClone(x);
function fixture(){
 const collections={
  dojos:{DOJO1:{location_id:'DOJO1',status:'ACTIVE'}},
  billing_blocks:{BLOCK1:{billing_block_id:'BLOCK1',location_id:'DOJO1',status:'ACTIVE'}},
  paymentEvidences:{EV1:{evidence_id:'EV1',invoice_id:'INV1',member_id:'MEM1',billing_group_id:'GR1',payment_method:'PayPay',evidence_code:'TEST1',status:'CONFIRMED',amount:1000}},
  invoices:{INV1:{invoice_id:'INV1',member_id:'MEM1',billing_group_id:'GR1',target_month:'2026-10','請求予定額':1000,'支払状態':'未入金'}},payments:{},payment_paypay_post_requests:{}
 };
 let reads=0,commits=0,failCommit=false;
 const db={collection(name){return {doc(id){return {name,id}},where(field,op,value){assert.equal(op,'==');return {name,filters:[[field,value]],where(f,o,v){this.filters.push([f,v]);return this},limit(n){this.max=n;return this}}}}},async runTransaction(callback){
   const changes=[];let wrote=false;
   const tx={async get(ref){assert.equal(wrote,false,'read after write');reads++;
      if(ref.id!==undefined){const val=collections[ref.name]?.[ref.id];return {exists:!!val,id:ref.id,data:()=>clone(val)}}
      const docs=Object.entries(collections[ref.name]||{}).filter(([,v])=>ref.filters.every(([f,x])=>v[f]===x)).slice(0,ref.max).map(([id,v])=>({exists:true,id,data:()=>clone(v)}));return {docs};
    },create(ref,value){wrote=true;changes.push(['create',ref,clone(value)])},update(ref,value){wrote=true;changes.push(['update',ref,clone(value)])}};
   const result=await callback(tx);
   if(failCommit)throw new Error('SIMULATED_COMMIT_FAILURE');
   const next=clone(collections);
   for(const [op,ref,value] of changes){next[ref.name]??={};if(op==='create'){assert.equal(next[ref.name][ref.id],undefined,'duplicate create');next[ref.name][ref.id]=value;}else{assert.ok(next[ref.name][ref.id],'missing update');Object.assign(next[ref.name][ref.id],value)}}
   Object.assign(collections,next);commits++;return result;
 }};
 const createProjection=()=>({calculateInvoiceStatuses(invoices,payments){return invoices.map(inv=>{const paid=payments.filter(p=>p.invoice_id===inv.invoice_id).reduce((sum,p)=>sum+p['入金額'],0);return {invoice_id:inv.invoice_id,unpaid_amount:Math.max(0,inv.amount-paid),status:paid>=inv.amount?'入金済':'未入金'}})}});
 const executor=createPayPayPostFirestoreExecutor(db,{getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',target_month:'2026-10',system_now:'2026-10-18 12:00:00'}),createProjection,serverTimestamp:()=> 'STAMP'});
 const request={request_id:'REQ1',location_id:'DOJO1',billing_block_id:'BLOCK1',evidence_items:[{evidence_id:'EV1'}]};
 const actor={authenticated_uid:'UID1',receptionist_id:'TEACHER1',teacher_id:'TEACHER1'};
 return {collections,executor,request,actor,stats:()=>({reads,commits}),setFailCommit:v=>{failCommit=v}};
}
async function rejects(fn,code){await assert.rejects(fn,e=>e.code===code,`expected ${code}`)}
async function main(){let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS',name)};
 await test('normal posting atomically creates payment, evidence, invoice and receipt',async()=>{const f=fixture(),r=await f.executor({request:f.request,actor:f.actor});assert.equal(r.ok,true);assert.equal(r.idempotent_replay,false);assert.equal(Object.keys(f.collections.payments).length,1);assert.equal(f.collections.paymentEvidences.EV1.status,'POSTED');assert.equal(f.collections.invoices.INV1['支払状態'],'入金済');assert.equal(Object.keys(f.collections.payment_paypay_post_requests).length,1)});
 await test('same request id replays without double posting',async()=>{const f=fixture();await f.executor({request:f.request,actor:f.actor});const r=await f.executor({request:f.request,actor:f.actor});assert.equal(r.idempotent_replay,true);assert.equal(Object.keys(f.collections.payments).length,1)});
 await test('same request id with changed actor is rejected',async()=>{const f=fixture();await f.executor({request:f.request,actor:f.actor});await rejects(()=>f.executor({request:f.request,actor:{...f.actor,teacher_id:'OTHER'}}),'PAYPAY_POST_REQUEST_CONFLICT')});
 await test('new request id cannot repost already posted evidence',async()=>{const f=fixture();await f.executor({request:f.request,actor:f.actor});await rejects(()=>f.executor({request:{...f.request,request_id:'REQ2'},actor:f.actor}),'PAYPAY_POST_EVIDENCE_INVALID');assert.equal(Object.keys(f.collections.payments).length,1)});
 await test('overpayment rejected without writes',async()=>{const f=fixture();f.collections.paymentEvidences.EV1.amount=1001;await rejects(()=>f.executor({request:f.request,actor:f.actor}),'PAYPAY_POST_OVERPAYMENT');assert.equal(Object.keys(f.collections.payments).length,0);assert.equal(f.collections.paymentEvidences.EV1.status,'CONFIRMED')});
 await test('wrong scope rejected without writes',async()=>{const f=fixture();f.collections.billing_blocks.BLOCK1.location_id='OTHER';await rejects(()=>f.executor({request:f.request,actor:f.actor}),'PAYPAY_POST_SCOPE_INVALID');assert.equal(Object.keys(f.collections.payments).length,0)});
 await test('missing actor rejected without writes',async()=>{const f=fixture();await rejects(()=>f.executor({request:f.request,actor:{} }),'PAYPAY_POST_ACTOR_REQUIRED');assert.equal(Object.keys(f.collections.payments).length,0)});
 await test('invalid invoice rejected without writes',async()=>{const f=fixture();f.collections.invoices.INV1.member_id='OTHER';await rejects(()=>f.executor({request:f.request,actor:f.actor}),'PAYPAY_POST_INVOICE_INVALID');assert.equal(Object.keys(f.collections.payments).length,0)});
 await test('failed transaction does not partially commit',async()=>{const f=fixture();f.collections.paymentEvidences.EV1.status='REQUESTED';await rejects(()=>f.executor({request:f.request,actor:f.actor}),'PAYPAY_POST_EVIDENCE_INVALID');assert.equal(Object.keys(f.collections.payment_paypay_post_requests).length,0);assert.equal(Object.keys(f.collections.payments).length,0)});
 await test('simulated commit failure rolls back all queued writes',async()=>{const f=fixture();f.setFailCommit(true);await assert.rejects(()=>f.executor({request:f.request,actor:f.actor}),/SIMULATED_COMMIT_FAILURE/);assert.equal(Object.keys(f.collections.payments).length,0);assert.equal(f.collections.paymentEvidences.EV1.status,'CONFIRMED');assert.equal(Object.keys(f.collections.payment_paypay_post_requests).length,0)});
 console.log(`PayPay Firestore post mock transaction: PASS (${count} cases)`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
