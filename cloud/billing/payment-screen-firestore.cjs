'use strict';
const {createReceptionSummaryReader}=require('./reception-summary-firestore.cjs');
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const fail=()=>{throw Error('PAYMENT_SCREEN_DATA_INVALID');};
const method=v=>{const t=String(v||'').trim(),u=t.toUpperCase();return t==='現金'?'CASH':t==='ペイペイ'?'PAYPAY':u;};
// Absolute nanoseconds for sorting. Zone-less GAS values are strictly Asia/Tokyo.
// Timestamp sub-millisecond precision is retained; displayed DTO remains GAS-shaped.
function requestedInstant(value){
  if(value&&typeof value==='object'&&Number.isSafeInteger(value.seconds)&&Number.isInteger(value.nanoseconds)&&value.nanoseconds>=0&&value.nanoseconds<1e9){
    const nanos=BigInt(value.seconds)*1000000000n+BigInt(value.nanoseconds),date=new Date(Number(nanos>=0n?nanos/1000000n:(nanos-999999n)/1000000n));
    if(!Number.isFinite(date.getTime()))fail();return {nanos,display:date};
  }
  if(value instanceof Date){if(!Number.isFinite(value.getTime()))fail();return {nanos:BigInt(value.getTime())*1000000n,display:value};}
  if(typeof value!=='string')fail();
  const m=/^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if(!m)fail();const [,y,mo,d,h,mi,s,f='',zone='+09:00']=m;
  const local=new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  if(!Number.isFinite(local.getTime())||local.toISOString().slice(0,19)!==`${y}-${mo}-${d}T${h}:${mi}:${s}`)fail();
  const offset=zone==='Z'?0:(Number(zone.slice(1,3))*60+Number(zone.slice(4,6)))*(zone[0]==='-'?-1:1);
  if(zone!=='Z'&&(Number(zone.slice(1,3))>14||Number(zone.slice(4,6))>59||(Number(zone.slice(1,3))===14&&Number(zone.slice(4,6))!==0)))fail();
  const nanos=BigInt(local.getTime()-offset*60000)*1000000n+BigInt(f.padEnd(9,'0'));
  return {nanos,display:value};
}
function createPaymentScreenReader(db,{getSystemContext,createProjection}){
  if(typeof db?.runTransaction!=='function'||typeof getSystemContext!=='function'||typeof createProjection!=='function')throw Error('PAYMENT_SCREEN_READER_REQUIRED');
  return async input=>{
    const clock=await getSystemContext();
    if(clock?.ok!==true||clock.timezone!=='Asia/Tokyo'||!MONTH.test(clock.target_month||''))fail();
    const month=input.target_month||clock.target_month,filter=input.payment_method||'PAYPAY';
    if(!MONTH.test(month)||typeof filter!=='string'||filter.length>64)fail();
    return db.runTransaction(async tx=>{
      // The existing summary Reader runs on this same read-only snapshot.
      const bound={collection:n=>db.collection(n),runTransaction:fn=>fn(tx)};
      const summaryReader=createReceptionSummaryReader(bound,{getSystemContext:async()=>clock,createProjection});
      const scope={location_id:input.location_id,billing_block_id:input.billing_block_id};
      if(input.reception_date)scope.reception_date=input.reception_date;
      const summary=await summaryReader(scope);
      const snap=await tx.get(db.collection('paymentEvidences').limit(500));
      if(!Array.isArray(snap.docs)||snap.docs.length>=500)throw Error('PAYMENT_SCREEN_READ_INCOMPLETE');
      const selected=[];const seen=new Set();
      for(const doc of snap.docs){
        const e={...doc.data()};
        if(!['REQUESTED','CONFIRMED','POSTED'].includes(e.status))fail();
        if(['CONFIRMED','POSTED'].includes(e.status)&&(typeof e.payment_method!=='string'||!e.payment_method.trim()))fail();
        if(!['CONFIRMED','POSTED'].includes(e.status)||method(e.payment_method)!==method(filter))continue;
        if(e.evidence_id!==doc.id||!ID.test(e.evidence_id||'')||seen.has(e.evidence_id)||!ID.test(e.invoice_id||''))fail();
        seen.add(e.evidence_id);selected.push(e);
      }
      const invoiceIds=[...new Set(selected.map(e=>e.invoice_id))],invoicesById=Object.create(null);
      if(invoiceIds.length){
        const docs=await tx.getAll(...invoiceIds.map(id=>db.collection('invoices').doc(id)));
        if(docs.length!==invoiceIds.length)fail();
        for(const doc of docs){if(!doc.exists)fail();const i=doc.data();if(i.invoice_id!==doc.id||!MONTH.test(i.target_month||'')||!ID.test(i.billing_group_id||''))fail();invoicesById[doc.id]=i;}
      }
      const relevant=selected.filter(e=>invoicesById[e.invoice_id].target_month===month);
      const times=new Map();const memberIds=new Set();
      for(const e of relevant){
        const invoice=invoicesById[e.invoice_id],member=e.member_id||invoice.member_id;
        if(!ID.test(member||'')||(e.member_id&&invoice.member_id&&e.member_id!==invoice.member_id)||
          (e.billing_group_id&&e.billing_group_id!==invoice.billing_group_id)||!ID.test(invoice.plan_id||'')||
          typeof e.amount!=='number'||!Number.isFinite(e.amount)||e.amount<=0)fail();
        if(typeof e.evidence_code!=='string'||!e.evidence_code.trim()||!e.confirmed_at||(e.status==='POSTED'&&(!e.posted_at||!ID.test(e.payment_log_id||'')))||
          (e.status==='CONFIRMED'&&(e.posted_at||e.payment_log_id)))fail();
        const instant=requestedInstant(e.requested_at);times.set(e.evidence_id,instant.nanos);e.requested_at=instant.display;
        for(const key of ['confirmed_at','posted_at'])if(e[key])e[key]=requestedInstant(e[key]).display;
        if(e.reception_date&&typeof e.reception_date!=='string'){
          const v=requestedInstant(e.reception_date);e.reception_date=v.display;
        }
        memberIds.add(member);
      }
      const memberNames=Object.create(null);
      if(memberIds.size){const docs=await tx.getAll(...[...memberIds].map(id=>db.collection('members').doc(id)));
        if(docs.length!==memberIds.size)fail();for(const doc of docs){if(!doc.exists)fail();const m=doc.data();if(m.member_id!==doc.id||typeof m.member_name!=='string')fail();memberNames[doc.id]=m.member_name;}}
      relevant.sort((a,b)=>times.get(a.evidence_id)>times.get(b.evidence_id)?-1:times.get(a.evidence_id)<times.get(b.evidence_id)?1:a.evidence_id<b.evidence_id?-1:a.evidence_id>b.evidence_id?1:0);
      const ctx={daoCore:new Proxy({},{get(){throw Error('PAYMENT_SCREEN_WRITE_FORBIDDEN');}}),timezone:'Asia/Tokyo',settings:{},clock:()=>new Date()};
      const projection=createProjection(ctx,{uuid:()=>{throw Error('PAYMENT_SCREEN_WRITE_FORBIDDEN');}});
      const model={invoicesById,memberNames,evidences:relevant};
      const confirmed=projection.readEvidenceList({target_month:month,statuses:'CONFIRMED',payment_method:filter},model);
      const posted=projection.readEvidenceList({target_month:month,statuses:'POSTED',payment_method:filter},model);
      if(!summary?.ok||!confirmed?.ok||!posted?.ok)fail();
      return {ok:true,summary,confirmed,posted};
    },{readOnly:true});
  };
}
module.exports={createPaymentScreenReader,requestedInstant};
