'use strict';

// Firebase DEV member-side PayPay flow. REQUESTED/CONFIRMED only; posting stays
// in the existing teacher-side payment_paypay_post_selected command.
const {stableId}=require('./payment-cash-accept-firestore.cjs');
const {validatePayPayCodeStart,validatePayPayCodeRecordBatch}=require('./payment-paypay-command.cjs');
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const row=s=>s.exists?{...s.data(),__id:s.id}:null;
const method=v=>String(v||'').trim().toUpperCase();
const evidenceDto=value=>({
  evidence_id:value.evidence_id,invoice_id:value.invoice_id,member_id:value.member_id,
  payment_method:value.payment_method,amount:value.amount,status:value.status,
  evidence_code:value.evidence_code||'',location_id:value.location_id||'',
  billing_block_id:value.billing_block_id||''
});

function createPayPayCodeFirestoreExecutor(db,{getSystemContext,createProjection,serverTimestamp}={}){
  if(typeof db?.runTransaction!=='function'||typeof getSystemContext!=='function'||
      typeof createProjection!=='function'||typeof serverTimestamp!=='function')
    throw new TypeError('PAYPAY_CODE_DEPENDENCY_REQUIRED');

  async function start({request,actor,paymentInfo}){
    request=validatePayPayCodeStart(request);
    if(!actor?.authenticated_uid||actor.admin!==true)fail('PAYPAY_CODE_FORBIDDEN',403);
    const clock=await getSystemContext();
    if(clock?.ok!==true||clock.timezone!=='Asia/Tokyo'||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(clock.target_month||'')||
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clock.system_now||''))
      fail('PAYPAY_CODE_CLOCK_INVALID',400);
    if(request.reception_date&&request.reception_date!==clock.system_now.slice(0,10))
      fail('PAYPAY_CODE_DATE_MISMATCH',400);
    if(paymentInfo?.ok!==true||paymentInfo.memberId!==request.member_id||
      paymentInfo.targetMonth!==clock.target_month||!ID.test(paymentInfo.billingGroupId||''))
      fail('PAYPAY_CODE_MEMBER_INFO_INVALID',400);
    if(request.plan_id&&![paymentInfo.planId,paymentInfo.planType,paymentInfo.feeType].includes(request.plan_id))
      fail('PAYPAY_CODE_PLAN_MISMATCH',409);
    if(!Number.isFinite(paymentInfo.unpaidAmount)||paymentInfo.unpaidAmount<=0)
      fail('PAYPAY_CODE_NOTHING_DUE',409);

    const group=paymentInfo.billingGroupId,month=clock.target_month;
    return db.runTransaction(async tx=>{
      let wrote=false;
      const list=async q=>{if(wrote)throw Error('PAYPAY_CODE_READ_AFTER_WRITE');const snap=await tx.get(q.limit(500));
        if(!Array.isArray(snap.docs)||snap.docs.length>=500)fail('PAYPAY_CODE_QUERY_INCOMPLETE');return snap.docs.map(row);};
      const invoices=await list(db.collection('invoices').where('billing_group_id','==',group).where('target_month','==',month));
      const payments=await list(db.collection('payments').where('billing_group_id','==',group).where('target_month','==',month));
      const evidences=[];
      for(const invoice of invoices)evidences.push(...await list(db.collection('paymentEvidences').where('invoice_id','==',invoice.invoice_id)));
      if(invoices.length===0)fail('PAYPAY_CODE_NO_INVOICE');
      if(invoices.some(i=>i.invoice_id!==i.__id||!ID.test(i.member_id||'')||
        !Number.isFinite(Number(i['請求予定額']??i['金額']))))fail('PAYPAY_CODE_INVOICE_INVALID',400);
      const projection=createProjection();
      const facts=invoices.map(i=>({invoice_id:i.invoice_id,amount:Number(i['請求予定額']??i['金額']),current_status:i['支払状態']}));
      const statuses=projection.calculateInvoiceStatuses(facts,payments);
      const due=statuses.filter(s=>s.status!=='取消'&&s.unpaid_amount>0);
      if(!due.length)fail('PAYPAY_CODE_NOTHING_DUE');
      if(due.reduce((sum,s)=>sum+s.unpaid_amount,0)!==paymentInfo.unpaidAmount)fail('PAYPAY_CODE_AMOUNT_CHANGED');
      const evidenceItems=[],requestResults=[];
      for(const state of due){
        const invoice=invoices.find(i=>i.invoice_id===state.invoice_id);
        const active=evidences.filter(e=>e.invoice_id===invoice.invoice_id&&method(e.payment_method)==='PAYPAY'&&['REQUESTED','CONFIRMED'].includes(e.status));
        if(active.length>1)fail('PAYPAY_CODE_DUPLICATE_ACTIVE');
        if(active.length===1){
          if(active[0].billing_group_id!==group||active[0].member_id!==invoice.member_id||active[0].amount!==state.unpaid_amount)
            fail('PAYPAY_CODE_ACTIVE_EVIDENCE_INVALID');
          evidenceItems.push(evidenceDto(active[0]));requestResults.push({ok:true,skipped:true,invoice_id:invoice.invoice_id,evidence_id:active[0].evidence_id,status:active[0].status});continue;
        }
        const evidenceId=stableId('PPE-',request.member_id+':'+month,invoice.invoice_id);
        const evidence={evidence_id:evidenceId,invoice_id:invoice.invoice_id,billing_group_id:group,
          member_id:invoice.member_id,payment_method:'PAYPAY',amount:state.unpaid_amount,
          reception_date:clock.system_now.slice(0,10),location_id:'',billing_block_id:'',teacher_id:'',
          reception_session_id:'',status:'REQUESTED',evidence_code:'',requested_at:clock.system_now,
          confirmed_at:'',confirmed_by:'',posted_at:'',payment_log_id:'',remarks:'paypay_code.html start',
          request_id:request.request_id,authenticated_uid:actor.authenticated_uid,recorded_at:serverTimestamp()};
        wrote=true;tx.create(db.collection('paymentEvidences').doc(evidenceId),evidence);
        evidenceItems.push(evidenceDto(evidence));requestResults.push({ok:true,skipped:false,invoice_id:invoice.invoice_id,evidence_id:evidenceId,status:'REQUESTED'});
      }
      return {ok:true,success:true,memberId:paymentInfo.memberId,memberName:paymentInfo.memberName||'',
        billingGroupId:group,targetMonth:month,planId:paymentInfo.planId||paymentInfo.planType||'',
        feeType:paymentInfo.feeType||paymentInfo.planType||'',amount:paymentInfo.unpaidAmount,
        status:paymentInfo.status||'',message:paymentInfo.message||'',invoiceIds:due.map(s=>s.invoice_id),
        invoiceCount:due.length,invoiceSummary:paymentInfo.invoiceSummary||'',invoiceItems:paymentInfo.invoiceItems||[],
        evidenceItems,requestResults,teacherId:'PAYPAY_MEMBER',locationId:'',billingBlockId:'',
        receptionDate:clock.system_now.slice(0,10)};
    });
  }

  async function record({request,actor}){
    request=validatePayPayCodeRecordBatch(request);
    if(!actor?.authenticated_uid||actor.admin!==true)fail('PAYPAY_CODE_FORBIDDEN',403);
    const clock=await getSystemContext();
    if(clock?.ok!==true||clock.timezone!=='Asia/Tokyo'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clock.system_now||''))
      fail('PAYPAY_CODE_CLOCK_INVALID',400);
    return db.runTransaction(async tx=>{
      const targets=[];
      const memberSnapshot=await tx.get(db.collection('members').doc(request.member_id));
      const member=row(memberSnapshot);
      for(const item of request.evidence_items){
        const evidence=await tx.get(db.collection('paymentEvidences').doc(item.evidence_id));
        targets.push(row(evidence));
      }
      if(!member||member.member_id!==request.member_id||!ID.test(member.billing_group_id||'')||
        targets.some(e=>!e||e.evidence_id!==e.__id||e.billing_group_id!==member.billing_group_id||method(e.payment_method)!=='PAYPAY'))
        fail('PAYPAY_CODE_EVIDENCE_INVALID');
      const results=[];
      for(const evidence of targets){
        if(evidence.status==='CONFIRMED'){
          if(evidence.evidence_code!==request.evidence_code)fail('PAYPAY_CODE_ALREADY_CONFIRMED');
          results.push({...evidenceDto(evidence),idempotent_replay:true});continue;
        }
        if(evidence.status!=='REQUESTED')fail('PAYPAY_CODE_EVIDENCE_INVALID');
        const update={status:'CONFIRMED',evidence_code:request.evidence_code,confirmed_at:clock.system_now,
          confirmed_by:request.member_id,request_id:request.request_id,authenticated_uid:actor.authenticated_uid,
          recorded_at:serverTimestamp()};
        tx.update(db.collection('paymentEvidences').doc(evidence.evidence_id),update);
        results.push(evidenceDto({...evidence,...update}));
      }
      return {ok:true,success:true,memberId:request.member_id,evidenceCode:request.evidence_code,
        evidenceItems:results,message:'PayPay決済コードを登録しました。先生の決済更新後に入金反映されます。'};
    });
  }
  return Object.freeze({start,record});
}
module.exports={createPayPayCodeFirestoreExecutor};
