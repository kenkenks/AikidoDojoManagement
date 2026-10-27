'use strict';

const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const {restoreMasterFields}=require('../attendance/master-fields.cjs');
const active=row=>['','有効','在籍','TRUE'].includes(String(row?.status??row?.['状態']??'').trim());
const dateValue=value=>value&&typeof value.toDate==='function'?value.toDate():value;

function createTeacherPaymentStatusReader(db,{getSystemContext,createProjection}){
  if(typeof db?.runTransaction!=='function'||typeof getSystemContext!=='function'||typeof createProjection!=='function')
    throw new TypeError('TEACHER_PAYMENT_STATUS_READER_REQUIRED');
  return async input=>{
    input=input||{};
    const clock=await getSystemContext();
    if(clock?.ok!==true||clock.timezone!=='Asia/Tokyo'||!MONTH.test(clock.target_month||'')||
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clock.system_now||''))throw Error('SYSTEM_CONTEXT_UNAVAILABLE');
    const targetMonth=input.target_month||clock.target_month;
    if(!MONTH.test(targetMonth)||input.date_from&&!DATE.test(input.date_from)||input.date_to&&!DATE.test(input.date_to))
      throw Error('INVALID_TEACHER_PAYMENT_STATUS_PARAMS');
    const now=new Date(clock.system_now.replace(' ','T')+'+09:00');
    if(!Number.isFinite(now.getTime()))throw Error('SYSTEM_CONTEXT_UNAVAILABLE');
    return db.runTransaction(async tx=>{
      const query=async(collection,filters=[])=>{
        let ref=db.collection(collection);for(const [key,value] of filters)ref=ref.where(key,'==',value);
        const snapshot=await tx.get(ref.limit(500));
        if(!Array.isArray(snapshot.docs)||snapshot.docs.length>=500)throw Error('TEACHER_PAYMENT_STATUS_READ_INCOMPLETE');
        return snapshot.docs.map(doc=>({...doc.data(),__id:doc.id}));
      };
      const [members,invoices,payments,attendances,blocks]=await Promise.all([
        query('members'),query('invoices',[['target_month',targetMonth]]),query('payments'),
        query('attendances',[['target_month',targetMonth]]),query('billing_blocks')
      ]);
      const tables={members:members.filter(active),invoices,payments:payments.map(row=>({...row,'日時':dateValue(row['日時'])})),
        attendances:attendances.map(row=>({...row,'稽古日':dateValue(row['稽古日'])})),
        billingBlocks:blocks.map(row=>restoreMasterFields('BillingBlock',row,row.__id))};
      const daoCore=new Proxy({read:name=>{if(!Object.hasOwn(tables,name))throw Error('TEACHER_PAYMENT_STATUS_TABLE_UNAVAILABLE');return tables[name];}},
        {get:(target,key)=>Object.hasOwn(target,key)?target[key]:(()=>{throw Error('TEACHER_PAYMENT_STATUS_WRITE_FORBIDDEN');})()});
      const ctx={daoCore,timezone:'Asia/Tokyo',clock:()=>now,
        settings:{TIME_TRAVEL_ENABLED:'TRUE',DEBUG_DATE:now.toISOString(),DEBUG_TARGET_MONTH:clock.target_month},cache:{}};
      const result=createProjection(ctx,{uuid:()=>{throw Error('TEACHER_PAYMENT_STATUS_WRITE_FORBIDDEN');}})
        .readTeacherPaymentStatus({target_month:targetMonth,date_from:input.date_from||'',date_to:input.date_to||''});
      if(!result||typeof result.ok!=='boolean'||!Array.isArray(result.members)||!Array.isArray(result.payments))
        throw Error('TEACHER_PAYMENT_STATUS_SOURCE_INVALID');
      return result;
    },{readOnly:true});
  };
}

module.exports={createTeacherPaymentStatusReader};
