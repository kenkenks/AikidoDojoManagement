'use strict';
// Bounded snapshot acquisition and evidence validation, not a second billing calculator.
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const conflict=()=>{throw Error('RECEPTION_SOURCE_CONFLICT');};
const migration=()=>{throw Error('RECEPTION_MIGRATION_REQUIRED');};
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const timestamp=v=>v instanceof Date?Number.isFinite(v.getTime()):typeof v==='string'&&
  validDate(v.slice(0,10).replaceAll('/','-'))&&/[T ]([01]\d|2[0-3]):[0-5]\d/.test(v)&&Number.isFinite(Date.parse(v));
const method=v=>{const s=String(v||'').trim(),u=s.toUpperCase();return s==='現金'?'CASH':['PayPay','ペイペイ'].includes(s)?'PAYPAY':u;};
function createReceptionSummaryReader(db,{getSystemContext,createProjection}){
  if(typeof db?.runTransaction!=='function'||typeof getSystemContext!=='function'||typeof createProjection!=='function')throw Error('RECEPTION_READER_REQUIRED');
  return async input=>{
    if(!ID.test(input?.location_id||'')||!ID.test(input?.billing_block_id||''))conflict();
    const clock=await getSystemContext();
    if(clock?.ok!==true||clock.timezone!=='Asia/Tokyo'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clock.system_now||''))conflict();
    const now=new Date(clock.system_now.replace(' ','T')+'+09:00');
    if(!Number.isFinite(now.getTime())||new Date(now.getTime()+9*3600000).toISOString().slice(0,19)!==clock.system_now.replace(' ','T'))conflict();
    const day=input.reception_date===undefined?clock.system_now.slice(0,10):input.reception_date;
    if(!validDate(day))conflict();
    const month=day.slice(0,7),params={reception_date:day,location_id:input.location_id,billing_block_id:input.billing_block_id};
    return db.runTransaction(async tx=>{
      const query=async(name,filters=[])=>{
        let q=db.collection(name);for(const [key,value]of filters)q=q.where(key,'==',value);
        const snap=await tx.get(q.limit(500));if(!Array.isArray(snap.docs)||snap.docs.length>=500)throw Error('RECEPTION_READ_INCOMPLETE');
        return snap.docs.map(d=>{const row={...d.data(),__id:d.id};
          if(row['日時']&&typeof row['日時'].toDate==='function')row['日時']=row['日時'].toDate();return row;});
      };
      const load=async(name,id)=>{const d=await tx.get(db.collection(name).doc(id));return d.exists?{...d.data(),__id:d.id}:null;};
      const dojo=await load('dojos',params.location_id),block=await load('billing_blocks',params.billing_block_id);
      if(!dojo||!block||block.location_id!==params.location_id)conflict();
      const views=await query('payment_status_views',[['target_month',month]]);
      const invoices=await query('invoices',[['target_month',month]]);
      const payments=await query('payments',[['target_month',month]]);
      const attendances=await query('attendances',[['target_month',month]]);
      // Evidence has no reliable target_month field. A bounded collection read avoids
      // per-member calls and proves whether reverse payment_log_id links are unique.
      const evidences=await query('paymentEvidences');
      const memberIds=new Set(views.map(v=>v.member_id));
      for(const p of payments)if(p.member_id)memberIds.add(p.member_id);
      for(const i of invoices)if(i.member_id)memberIds.add(i.member_id);
      for(const e of evidences)if(payments.some(p=>p.payment_id===e.payment_log_id||p['決済ID']===e.evidence_id)&&e.member_id)memberIds.add(e.member_id);
      if(memberIds.size>=500||[...memberIds].some(id=>!ID.test(id)))migration();
      const members=new Map();
      if(memberIds.size){
        const docs=await tx.getAll(...[...memberIds].map(id=>db.collection('members').doc(id)));
        if(docs.length!==memberIds.size)conflict();
        for(const d of docs){if(!d.exists)migration();const m=d.data();if(m.member_id!==d.id||typeof m.member_name!=='string'||!ID.test(m.billing_group_id||''))migration();members.set(d.id,m);}
      }
      const groups=new Set(),viewMembers=new Set();
      for(const v of views){
        if(!ID.test(v.member_id||'')||viewMembers.has(v.member_id))conflict();viewMembers.add(v.member_id);
        const m=members.get(v.member_id);if(!m||m.billing_group_id!==v.billing_group_id||m.member_name!==v['会員名'])migration();groups.add(v.billing_group_id);
      }
      const invoiceMap=new Map();
      for(const i of invoices.filter(i=>groups.has(i.billing_group_id))){
        if(i.invoice_id!==i.__id||invoiceMap.has(i.invoice_id)||!money(i['請求予定額'])||!money(i['金額'])||typeof i['支払状態']!=='string'||!ID.test(i.plan_id||''))conflict();
        if(i.member_id&&members.get(i.member_id)?.billing_group_id!==i.billing_group_id)migration();
        invoiceMap.set(i.invoice_id,i);
      }
      const resolved=[],seenPayments=new Set();
      for(const p of payments.filter(p=>groups.has(p.billing_group_id))){
        if(p.payment_id!==p.__id||!ID.test(p.payment_id||'')||seenPayments.has(p.payment_id)||!money(p['入金額'])||!method(p['支払方法']))conflict();seenPayments.add(p.payment_id);
        if(!validDate(p.reception_date)||!ID.test(p.location_id||'')||!ID.test(p.billing_block_id||'')||!timestamp(p['日時']))migration();
        let invoice=p.invoice_id?invoiceMap.get(p.invoice_id):null;
        if(p.invoice_id&&!invoice)conflict();
        const links=evidences.filter(e=>(p['決済ID']&&e.evidence_id===p['決済ID'])||e.payment_log_id===p.payment_id);
        if(links.length>1)conflict();
        const e=links[0];
        if(e&&(e.evidence_id!==e.__id||e.status!=='POSTED'||e.payment_log_id!==p.payment_id||
          (p['決済ID']&&p['決済ID']!==e.evidence_id)||e.amount!==p['入金額']||method(e.payment_method)!==method(p['支払方法'])||
          (p.invoice_id&&e.invoice_id!==p.invoice_id)||e.reception_date!==p.reception_date||e.location_id!==p.location_id||e.billing_block_id!==p.billing_block_id))conflict();
        if(e?.invoice_id){
          const linkedInvoice=invoiceMap.get(e.invoice_id);
          if(!linkedInvoice||linkedInvoice.billing_group_id!==p.billing_group_id)conflict();
          invoice=linkedInvoice;
        }
        const ids=[p.member_id,e?.member_id,invoice?.member_id].filter(Boolean);
        if(!ids.length)migration();if(new Set(ids).size!==1)conflict();
        if(members.get(ids[0])?.billing_group_id!==p.billing_group_id)migration();
        resolved.push({...p,member_id:ids[0]});
      }
      const inScope=r=>r.reception_date===day&&r.location_id===params.location_id&&r.billing_block_id===params.billing_block_id;
      if(payments.some(p=>inScope(p)&&!groups.has(p.billing_group_id))||attendances.some(a=>a['稽古日']===day&&a.location_id===params.location_id&&a.billing_block_id===params.billing_block_id&&!viewMembers.has(a.member_id)))migration();
      const selectedAttendances=attendances.filter(a=>viewMembers.has(a.member_id));
      for(const a of selectedAttendances)if(a.attendance_id!==a.__id||!validDate(a['稽古日'])||!ID.test(a.location_id||'')||!ID.test(a.billing_block_id||'')||!ID.test(a.slot_id||'')||typeof a['状態']!=='string')conflict();
      const ctx={daoCore:new Proxy({},{get(){throw Error('RECEPTION_WRITE_FORBIDDEN');}}),receptionViews:[],timezone:'Asia/Tokyo',clock:()=>now,
        settings:{TIME_TRAVEL_ENABLED:'TRUE',DEBUG_DATE:now.toISOString(),DEBUG_TARGET_MONTH:month},cache:{}};
      const projection=createProjection(ctx,{uuid:()=>{throw Error('RECEPTION_WRITE_FORBIDDEN');}});
      const facts=projection.projectReceptionSources({invoices:[...invoiceMap.values()],payments:resolved,attendances:selectedAttendances});
      const parse=(v,key)=>{try{const x=JSON.parse(v[key]);if(!Array.isArray(x)||x.some(r=>!r||typeof r!=='object'||Array.isArray(r)))conflict();return x;}catch{conflict();}};
      // Preserve the original member×month View population and order. The persisted
      // View is advisory: rebuild its detail JSON in memory from this transaction's
      // canonical snapshot. Never repair/upsert the persisted View during a GET.
      for(const v of views){
        const expected={invoice_items_json:facts.invoices.filter(i=>i.billing_group_id===v.billing_group_id),
          reception_payments_json:facts.payments.filter(p=>p.billing_group_id===v.billing_group_id),
          attendance_items_json:facts.attendances.filter(a=>a.member_id===v.member_id)};
        for(const [key,rows]of Object.entries(expected)){
          const idKey={invoice_items_json:'invoice_id',reception_payments_json:'payment_id',attendance_items_json:'attendance_id'}[key];
          const items=parse(v,key),ids=new Set();
          for(const item of items){if(!ID.test(item[idKey]||'')||ids.has(item[idKey]))conflict();ids.add(item[idKey]);}
          v[key]=JSON.stringify(rows);
        }
      }
      ctx.receptionViews=views;
      return projection.readReceptionSummary(params);
    },{readOnly:true});
  };
}
module.exports={createReceptionSummaryReader};
