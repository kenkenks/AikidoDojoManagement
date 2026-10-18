'use strict';
// Firestore DEV PayPay posting. Not wired to HTTP until contract/auth review.
const {digest,stableId}=require('./payment-cash-accept-firestore.cjs');
const {validatePayPayPostSelected}=require('./payment-paypay-command.cjs');
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const data=s=>s.exists?{...s.data(),__id:s.id}:null;
const method=v=>String(v||'').trim().toUpperCase();
function createPayPayPostFirestoreExecutor(db,{getSystemContext,createProjection,serverTimestamp}={}){
  if(typeof db?.runTransaction!=='function'||typeof getSystemContext!=='function'||typeof createProjection!=='function'||typeof serverTimestamp!=='function')throw new TypeError('PAYPAY_POST_DEPENDENCY_REQUIRED');
  return async ({request,actor})=>{
    request=validatePayPayPostSelected(request);
    if(!actor?.authenticated_uid||!actor?.receptionist_id)fail('PAYPAY_POST_ACTOR_REQUIRED',403);
    const clock=await getSystemContext();
    if(clock?.ok!==true||clock.timezone!=='Asia/Tokyo'||!MONTH.test(clock.target_month||'')||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clock.system_now||''))fail('PAYPAY_POST_CLOCK_INVALID',400);
    const hash=digest({request,actor});
    return db.runTransaction(async tx=>{
      const read=async ref=>data(await tx.get(ref));
      const list=async q=>{const snap=await tx.get(q.limit(500));if(!Array.isArray(snap.docs)||snap.docs.length>=500)fail('PAYPAY_POST_QUERY_INCOMPLETE');return snap.docs.map(data);};
      const receiptRef=db.collection('payment_paypay_post_requests').doc(request.request_id);
      const prior=await read(receiptRef);
      if(prior){if(prior.input_hash!==hash||prior.status!=='COMPLETED'||!prior.result)fail('PAYPAY_POST_REQUEST_CONFLICT');return {...prior.result,idempotent_replay:true};}
      const location=await read(db.collection('dojos').doc(request.location_id));
      const block=await read(db.collection('billing_blocks').doc(request.billing_block_id));
      const active=r=>r&&['有効','ACTIVE','TRUE',true].includes(r['状態']??r.status);
      if(!active(location)||location.location_id!==request.location_id||!active(block)||block.billing_block_id!==request.billing_block_id||block.location_id!==request.location_id)fail('PAYPAY_POST_SCOPE_INVALID',400);
      const rows=[];
      for(const item of request.evidence_items){
        const evidence=await read(db.collection('paymentEvidences').doc(item.evidence_id));
        if(!evidence||evidence.evidence_id!==item.evidence_id||evidence.status!=='CONFIRMED'||method(evidence.payment_method)!=='PAYPAY'||!String(evidence.evidence_code||'').trim()||evidence.payment_log_id||evidence.posted_at)fail('PAYPAY_POST_EVIDENCE_INVALID');
        if(!ID.test(evidence.invoice_id||'')||!Number.isFinite(evidence.amount)||evidence.amount<=0)fail('PAYPAY_POST_EVIDENCE_AMOUNT_INVALID');
        const invoice=await read(db.collection('invoices').doc(evidence.invoice_id));
        if(!invoice||invoice.invoice_id!==evidence.invoice_id||invoice.target_month!==clock.target_month||!ID.test(invoice.billing_group_id||'')||!ID.test(invoice.member_id||'')||invoice.member_id!==evidence.member_id||invoice.billing_group_id!==evidence.billing_group_id)fail('PAYPAY_POST_INVOICE_INVALID');
        if(rows.some(r=>r.invoice.invoice_id===invoice.invoice_id))fail('PAYPAY_POST_DUPLICATE_INVOICE');
        rows.push({evidence,invoice});
      }
      const groups=[...new Set(rows.map(r=>r.invoice.billing_group_id))];
      const projections=new Map();
      for(const group of groups){
        const invoices=await list(db.collection('invoices').where('billing_group_id','==',group).where('target_month','==',clock.target_month));
        const payments=await list(db.collection('payments').where('billing_group_id','==',group).where('target_month','==',clock.target_month));
        if(invoices.some(i=>i.invoice_id!==i.__id||!Number.isFinite(Number(i['請求予定額']??i['金額']))||Number(i['請求予定額']??i['金額'])<0)||payments.some(p=>p.payment_id!==p.__id||!Number.isFinite(p['入金額'])||p['入金額']<0))fail('PAYPAY_POST_GROUP_INVALID');
        const projection=createProjection();
        const facts=invoices.map(i=>({invoice_id:i.invoice_id,amount:Number(i['請求予定額']??i['金額']),current_status:i['支払状態']}));
        const before=projection.calculateInvoiceStatuses(facts,payments);
        const additions=rows.filter(r=>r.invoice.billing_group_id===group).map(r=>({invoice_id:r.invoice.invoice_id,'入金額':r.evidence.amount}));
        for(const addition of additions){const existing=before.find(s=>s.invoice_id===addition.invoice_id);if(!existing||existing.status==='取消'||existing.unpaid_amount<addition['入金額'])fail('PAYPAY_POST_OVERPAYMENT');}
        const after=projection.calculateInvoiceStatuses(facts,payments.concat(additions));
        projections.set(group,{before,after});
      }
      // All reads complete before writes; transaction retries guarantee atomicity.
      const results=[];
      for(const {evidence,invoice} of rows){
        const paymentId=stableId('PAY-',request.request_id,evidence.evidence_id);
        const payment={payment_id:paymentId,'日時':evidence.confirmed_at||clock.system_now,reception_date:clock.system_now.slice(0,10),target_month:clock.target_month,billing_group_id:invoice.billing_group_id,invoice_id:invoice.invoice_id,member_id:evidence.member_id,'支払方法':'PayPay','入金額':evidence.amount,'決済ID':evidence.evidence_id,location_id:request.location_id,billing_block_id:request.billing_block_id,teacher_id:actor.teacher_id||'',reception_session_id:request.reception_session_id||'',request_id:request.request_id,authenticated_uid:actor.authenticated_uid,remarks:'Firebase DEV 模擬決済',recorded_at:serverTimestamp()};
        tx.create(db.collection('payments').doc(paymentId),payment);
        tx.update(db.collection('paymentEvidences').doc(evidence.evidence_id),{status:'POSTED',posted_at:clock.system_now,payment_log_id:paymentId,reception_date:clock.system_now.slice(0,10),location_id:request.location_id,billing_block_id:request.billing_block_id,teacher_id:actor.teacher_id||'',reception_session_id:request.reception_session_id||''});
        const status=projections.get(invoice.billing_group_id).after.find(s=>s.invoice_id===invoice.invoice_id);
        tx.update(db.collection('invoices').doc(invoice.invoice_id),{'支払状態':status.status});
        results.push({evidence_id:evidence.evidence_id,payment_id:paymentId,invoice_id:invoice.invoice_id,amount:evidence.amount,invoice_status:status.status});
      }
      const result={ok:true,request_id:request.request_id,results,posted:results,skipped:[]};
      tx.create(receiptRef,{request_id:request.request_id,input_hash:hash,status:'COMPLETED',authenticated_uid:actor.authenticated_uid,business_datetime:clock.system_now,result,recorded_at:serverTimestamp()});
      return {...result,idempotent_replay:false};
    });
  };
}
module.exports={createPayPayPostFirestoreExecutor};
