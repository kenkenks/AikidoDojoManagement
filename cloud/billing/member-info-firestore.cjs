'use strict';
// Storage boundary only. Amounts, charging rules and response DTO remain in GAS.
const {restoreMasterFields}=require('../attendance/master-fields.cjs');
const {monthlySelectionDocumentId}=require('../attendance/monthly-selection-key.cjs');
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const fail=()=>{throw Error('BILLING_SOURCE_INVALID');};
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
function createBillingMemberInfoReader(db,{getSystemContext,createProjection}){
  if(typeof db?.runTransaction!=='function'||typeof getSystemContext!=='function'||typeof createProjection!=='function')throw Error('BILLING_READER_REQUIRED');
  return async memberId=>{
    if(!ID.test(memberId||''))fail();
    const clock=await getSystemContext();
    if(clock?.ok!==true||clock.timezone!=='Asia/Tokyo'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(clock.target_month||'')||
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clock.system_now||''))fail();
    const now=new Date(clock.system_now.replace(' ','T')+'+09:00');
    if(!Number.isFinite(now.getTime())||new Date(now.getTime()+9*3600000).toISOString().slice(0,19)!==clock.system_now.replace(' ','T'))fail();
    const month=clock.target_month;
    return db.runTransaction(async tx=>{
      const read=async(collection,id)=>{const doc=await tx.get(db.collection(collection).doc(id));return doc.exists?{...doc.data(),__id:doc.id}:null;};
      const query=async(collection,filters=[])=>{
        let q=db.collection(collection);for(const [key,value]of filters)q=q.where(key,'==',value);
        const snapshot=await tx.get(q.limit(500));
        if(!Array.isArray(snapshot.docs)||snapshot.docs.length>=500)throw Error('BILLING_READ_INCOMPLETE');
        return snapshot.docs.map(doc=>({...doc.data(),__id:doc.id}));
      };
      const member=await read('members',memberId);
      if(!member||member.member_id!==memberId||typeof member.member_name!=='string'||!ID.test(member.billing_group_id||''))fail();
      const group=member.billing_group_id;
      const invoices=await query('invoices',[['billing_group_id',group],['target_month',month]]);
      const payments=await query('payments',[['billing_group_id',group],['target_month',month]]);
      const attendances=await query('attendances',[['member_id',memberId]]);
      const selections=await query('monthly_selections',[['billing_group_id',group],['target_month',month]]);
      if(selections.length>1)fail();
      for(const row of selections)if(row.__id!==monthlySelectionDocumentId(group,month)||!ID.test(row.plan_id||''))fail();
      const blocks=(await query('billing_blocks')).map(row=>restoreMasterFields('BillingBlock',row,row.__id));
      const evidenceMap=new Map();
      for(const filters of [[['member_id',memberId]],[['billing_group_id',group]]])
        for(const row of await query('paymentEvidences',filters))evidenceMap.set(row.__id,row);
      if(evidenceMap.size>=500)throw Error('BILLING_READ_INCOMPLETE');
      const evidences=[...evidenceMap.values()],invoiceMap=new Map(invoices.map(row=>[row.invoice_id,row]));
      for(const row of evidences){
        if(!ID.test(row.invoice_id||'')||row.evidence_id!==row.__id||!amount(row.amount)||
          !['REQUESTED','CONFIRMED','POSTED'].includes(row.status))fail();
        if(!invoiceMap.has(row.invoice_id)){
          const invoice=await read('invoices',row.invoice_id);if(!invoice)fail();invoiceMap.set(row.invoice_id,invoice);
        }
      }
      for(const row of invoiceMap.values()){
        if(row.invoice_id!==row.__id||!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.target_month||'')||
          !ID.test(row.billing_group_id||'')||!ID.test(row.plan_id||'')||
          !amount(row['請求予定額'])||!amount(row['金額'])||!amount(row['上限金額'])||typeof row['支払状態']!=='string')fail();
      }
      for(const row of payments)if(row.payment_id!==row.__id||!amount(row['入金額'])||typeof row['支払方法']!=='string'||!row['支払方法'].trim()||
        (row.invoice_id&&!invoiceMap.has(row.invoice_id)))fail();
      for(const row of attendances){
        const d=row['稽古日'];
        if(row.attendance_id!==row.__id||!/^\d{4}-\d{2}-\d{2}$/.test(d||'')||
          !Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d||
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.target_month||'')||typeof row['状態']!=='string'||
          !ID.test(row.billing_block_id||'')||!ID.test(row.slot_id||''))fail();
        if(!blocks.some(b=>b.billing_block_id===row.billing_block_id))fail();
      }
      const views=await query('payment_status_views',[['member_id',memberId],['target_month',month]]);
      if(views.length>1||views.some(v=>v.billing_group_id!==group))fail();
      const tables={members:[member],invoices:[...invoiceMap.values()],payments,attendances,monthlySelections:selections,
        billingBlocks:blocks,paymentEvidences:evidences};
      const daoCore=new Proxy({read:name=>{if(!Object.hasOwn(tables,name))throw Error('BILLING_TABLE_UNAVAILABLE');return tables[name];}},
        {get:(target,key)=>{if(Object.hasOwn(target,key))return target[key];throw Error('BILLING_WRITE_FORBIDDEN');}});
      const ctx={daoCore,timezone:'Asia/Tokyo',clock:()=>now,settings:{TIME_TRAVEL_ENABLED:'TRUE',DEBUG_DATE:now.toISOString(),DEBUG_TARGET_MONTH:month},cache:{}};
      // Always recompute from the same read snapshot. Never refresh/upsert the View.
      const result=createProjection(ctx,{uuid:()=>{throw Error('BILLING_WRITE_FORBIDDEN');}}).readMemberInfo(memberId,month,views[0]||null);
      if(result?.ok!==true||result.memberId!==memberId||result.targetMonth!==month||
        !['billedTotal','paidTotal','unpaidAmount','cashPaidTotal','paypayPaidTotal','otherPaidTotal'].every(k=>amount(result[k])))fail();
      return result;
    },{readOnly:true});
  };
}
module.exports={createBillingMemberInfoReader};
