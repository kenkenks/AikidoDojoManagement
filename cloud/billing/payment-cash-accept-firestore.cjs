'use strict';
const {createHash}=require('node:crypto');

const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const BUSINESS_TIME=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const amount=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const conflict=code=>Object.assign(new Error(code),{code,status:409});
const invalid=code=>Object.assign(new Error(code),{code,status:400});

function stableJson(value){
  if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJson(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function digest(value){return createHash('sha256').update(stableJson(value)).digest('hex');}
function stableId(prefix,requestId,invoiceId){return prefix+createHash('sha256').update(requestId+'\n'+invoiceId).digest('hex').slice(0,24);}
function active(row){return row&&['有効','ACTIVE','TRUE',true].includes(row['状態']??row.status);}
function plain(snapshot){return snapshot.exists?{...snapshot.data(),__id:snapshot.id}:null;}

function createPaymentCashAcceptFirestoreExecutor(db,{getSystemContext,createProjection,serverTimestamp}={}){
  if(typeof db?.collection!=='function'||typeof db?.runTransaction!=='function')throw new TypeError('PAYMENT_CASH_FIRESTORE_REQUIRED');
  if(typeof getSystemContext!=='function'||typeof createProjection!=='function'||typeof serverTimestamp!=='function')
    throw new TypeError('PAYMENT_CASH_DEPENDENCY_REQUIRED');

  return async function executeAtomic({request,actor}){
    const clock=await getSystemContext();
    if(clock?.ok!==true||clock.timezone!=='Asia/Tokyo'||!MONTH.test(clock.target_month||'')||
      !BUSINESS_TIME.test(clock.system_now||''))throw invalid('PAYMENT_CASH_SYSTEM_CONTEXT_INVALID');
    const businessDate=clock.system_now.slice(0,10),month=clock.target_month;
    const inputHash=digest({request,actor});
    const requestRef=db.collection('payment_cash_requests').doc(request.request_id);

    return db.runTransaction(async tx=>{
      let wrote=false;
      const read=async ref=>{if(wrote)throw Error('PAYMENT_CASH_READ_AFTER_WRITE');return plain(await tx.get(ref));};
      const query=async q=>{if(wrote)throw Error('PAYMENT_CASH_READ_AFTER_WRITE');const snap=await tx.get(q.limit(500));
        if(!Array.isArray(snap.docs)||snap.docs.length>=500)throw invalid('PAYMENT_CASH_READ_INCOMPLETE');
        return snap.docs.map(plain);};
      const create=(ref,data)=>{wrote=true;tx.create(ref,data);};
      const update=(ref,data)=>{wrote=true;tx.update(ref,data);};

      // Firestore requires every read before the first write.
      const prior=await read(requestRef);
      if(prior){
        if(prior.input_hash!==inputHash)throw conflict('PAYMENT_CASH_REQUEST_CONFLICT');
        if(prior.status!=='COMPLETED'||!prior.result)throw conflict('PAYMENT_CASH_REQUEST_INCOMPLETE');
        return {...prior.result,idempotent_replay:true};
      }

      const item=request.items[0];
      const memberRef=db.collection('members').doc(item.member_id);
      const locationRef=db.collection('dojos').doc(request.location_id);
      const blockRef=db.collection('billing_blocks').doc(request.billing_block_id);
      const member=await read(memberRef),location=await read(locationRef),block=await read(blockRef);
      let invoiceQuery=db.collection('invoices').where('billing_group_id','==',item.billing_group_id).where('target_month','==',month);
      let paymentQuery=db.collection('payments').where('billing_group_id','==',item.billing_group_id).where('target_month','==',month);
      const invoices=await query(invoiceQuery),payments=await query(paymentQuery);
      const evidences=[];
      for(const invoice of invoices){
        const rows=await query(db.collection('paymentEvidences').where('invoice_id','==',invoice.invoice_id));
        evidences.push(...rows);
      }

      if(!member||member.member_id!==item.member_id||member.billing_group_id!==item.billing_group_id)
        throw invalid('PAYMENT_CASH_MEMBER_GROUP_INVALID');
      if(!active(location)||location.location_id!==request.location_id||!active(block)||
        block.billing_block_id!==request.billing_block_id||block.location_id!==request.location_id)
        throw invalid('PAYMENT_CASH_RECEPTION_SCOPE_INVALID');
      if(invoices.length===0)throw conflict('PAYMENT_CASH_NO_INVOICE');
      if(invoices.some(row=>row.invoice_id!==row.__id||row.billing_group_id!==item.billing_group_id||
        row.target_month!==month||!amount(row['請求予定額']??row['金額'])))
        throw invalid('PAYMENT_CASH_INVOICE_INVALID');
      if(payments.some(row=>row.payment_id!==row.__id||row.billing_group_id!==item.billing_group_id||
        row.target_month!==month||!amount(row['入金額'])||
        (row.invoice_id&&!invoices.some(invoice=>invoice.invoice_id===row.invoice_id))))
        throw invalid('PAYMENT_CASH_PAYMENT_INVALID');
      if(evidences.some(row=>['REQUESTED','CONFIRMED'].includes(row.status)))
        throw conflict('PAYMENT_CASH_EVIDENCE_PENDING');

      const projection=createProjection();
      if(typeof projection?.calculateInvoiceStatuses!=='function')throw Error('PAYMENT_CASH_PROJECTION_REQUIRED');
      const invoiceFacts=invoices.map(row=>({invoice_id:row.invoice_id,
        amount:Number(row['請求予定額']??row['金額']??0),current_status:row['支払状態']}));
      const before=projection.calculateInvoiceStatuses(invoiceFacts,payments);
      const receivable=before.filter(row=>row.status!=='取消'&&row.unpaid_amount>0);
      if(receivable.length===0)throw conflict('PAYMENT_CASH_NOTHING_DUE');

      const newPayments=receivable.map(row=>({'invoice_id':row.invoice_id,'入金額':row.unpaid_amount}));
      const after=projection.calculateInvoiceStatuses(invoiceFacts,payments.concat(newPayments));
      if(after.some(row=>row.status!=='取消'&&row.unpaid_amount!==0))throw Error('PAYMENT_CASH_PROJECTION_INCOMPLETE');

      const recordedAt=serverTimestamp(),paymentResults=[];
      for(const allocation of receivable){
        const invoice=invoices.find(row=>row.invoice_id===allocation.invoice_id);
        const paymentId=stableId('PAY-',request.request_id,invoice.invoice_id);
        const evidenceId=stableId('CASH-',request.request_id,invoice.invoice_id);
        const payment={payment_id:paymentId,'日時':clock.system_now,target_month:month,
          billing_group_id:item.billing_group_id,invoice_id:invoice.invoice_id,member_id:invoice.member_id,
          '支払方法':'現金','入金額':allocation.unpaid_amount,'決済ID':evidenceId,
          '備考':'Firebase先生会費受付',reception_date:businessDate,location_id:request.location_id,
          billing_block_id:request.billing_block_id,teacher_id:actor.teacher_id,
          reception_session_id:request.reception_session_id,request_id:request.request_id,
          authenticated_uid:actor.authenticated_uid,receptionist_type:actor.receptionist_type,
          receptionist_id:actor.receptionist_id,recorded_at:recordedAt};
        const evidence={evidence_id:evidenceId,invoice_id:invoice.invoice_id,
          billing_group_id:item.billing_group_id,member_id:invoice.member_id,payment_method:'CASH',
          amount:allocation.unpaid_amount,reception_date:businessDate,location_id:request.location_id,
          billing_block_id:request.billing_block_id,teacher_id:actor.teacher_id,
          reception_session_id:request.reception_session_id,status:'POSTED',evidence_code:evidenceId+'-OK',
          requested_at:clock.system_now,confirmed_at:clock.system_now,confirmed_by:actor.receptionist_id,
          posted_at:clock.system_now,payment_log_id:paymentId,remarks:'Firebase先生会費受付',
          request_id:request.request_id,authenticated_uid:actor.authenticated_uid,
          receptionist_type:actor.receptionist_type,receptionist_id:actor.receptionist_id,
          recorded_at:recordedAt};
        create(db.collection('paymentEvidences').doc(evidenceId),evidence);
        create(db.collection('payments').doc(paymentId),payment);
        const next=after.find(row=>row.invoice_id===invoice.invoice_id);
        update(db.collection('invoices').doc(invoice.invoice_id),{'支払状態':next.status});
        paymentResults.push({invoice_id:invoice.invoice_id,payment_id:paymentId,evidence_id:evidenceId,
          accepted_amount:allocation.unpaid_amount,invoice_status:next.status});
      }
      const result=Object.freeze({ok:true,request_id:request.request_id,target_month:month,
        reception_date:businessDate,billing_group_id:item.billing_group_id,
        accepted_amount:paymentResults.reduce((sum,row)=>sum+row.accepted_amount,0),payments:paymentResults});
      create(requestRef,{request_id:request.request_id,input_hash:inputHash,status:'COMPLETED',
        authenticated_uid:actor.authenticated_uid,receptionist_type:actor.receptionist_type,
        receptionist_id:actor.receptionist_id,business_datetime:clock.system_now,
        recorded_at:recordedAt,result});
      return {...result,idempotent_replay:false};
    });
  };
}

module.exports={createPaymentCashAcceptFirestoreExecutor,stableJson,digest,stableId};
