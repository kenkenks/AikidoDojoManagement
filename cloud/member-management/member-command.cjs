'use strict';
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const TEXT_FIELDS=['member_name','member_name_kana','member_type','status','billing_group_id','joined_date','withdrawn_date',
  'suspension_start_month','suspension_end_month','birth_date','insurance_type','email','phone','remarks','current_rank',
  'rank_source','rank_updated_at','rank_start_date'];
const COUNT_FIELDS=['carried_training_count','eligible_training_count'];
const ALLOWED=new Set(['member_id',...TEXT_FIELDS,...COUNT_FIELDS]);
function fail(code,status=400){const e=new Error(code);e.code=code;e.status=status;throw e;}
function cleanText(value,key){
  if(typeof value!=='string'||value.length>5000)fail('INVALID_MEMBER_MANAGEMENT_INPUT');
  const text=value.trim();
  if(['joined_date','withdrawn_date','birth_date','rank_updated_at','rank_start_date'].includes(key)&&text&&!DATE.test(text))fail('INVALID_MEMBER_MANAGEMENT_INPUT');
  if(['suspension_start_month','suspension_end_month'].includes(key)&&text&&!MONTH.test(text))fail('INVALID_MEMBER_MANAGEMENT_INPUT');
  return text;
}
function normalizeMember(input,{create=false}={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!ALLOWED.has(k)))fail('INVALID_MEMBER_MANAGEMENT_INPUT');
  const memberId=String(input.member_id||'').trim();
  if(!ID.test(memberId))fail('INVALID_MEMBER_MANAGEMENT_INPUT');
  const values={};
  for(const key of TEXT_FIELDS)if(Object.hasOwn(input,key))values[key]=cleanText(input[key],key);
  for(const key of COUNT_FIELDS)if(Object.hasOwn(input,key)){
    if(!Number.isInteger(input[key])||input[key]<0)fail('INVALID_MEMBER_MANAGEMENT_INPUT');
    values[key]=input[key];
  }
  if(create){
    if(!values.member_name||!values.member_type||!values.billing_group_id||!values.joined_date)fail('INVALID_MEMBER_MANAGEMENT_INPUT');
    if(!values.status)values.status='在籍';
  }
  if(!Object.keys(values).length)fail('INVALID_MEMBER_MANAGEMENT_INPUT');
  return {member_id:memberId,values};
}
function createMemberManagementCommand(db){
  if(!db||typeof db.runTransaction!=='function'||typeof db.collection!=='function')throw new Error('MEMBER_MANAGEMENT_REPOSITORY_REQUIRED');
  async function save(input,actor){
    if(actor?.admin!==true||typeof actor.uid!=='string'||!actor.uid)fail('MEMBER_MANAGEMENT_FORBIDDEN',403);
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['mode','member'].includes(k)))fail('INVALID_MEMBER_MANAGEMENT_INPUT');
    const create=input?.mode==='create';
    if(!create&&input?.mode!=='update')fail('INVALID_MEMBER_MANAGEMENT_INPUT');
    if(!create&&Object.hasOwn(input.member||{},'billing_group_id'))fail('INVALID_MEMBER_MANAGEMENT_INPUT');
    const normalized=normalizeMember(input.member,{create});
    return db.runTransaction(async tx=>{
      const ref=db.collection('members').doc(normalized.member_id);
      const snap=await tx.get(ref);
      if(create&&snap.exists)fail('MEMBER_ALREADY_EXISTS',409);
      if(!create&&!snap.exists)fail('MEMBER_NOT_FOUND',404);
      const values={...normalized.values,member_id:normalized.member_id};
      create?tx.create(ref,values):tx.update(ref,values);
      return {ok:true,mode:input.mode,member_id:normalized.member_id};
    });
  }
  async function withdraw(input,actor){
    if(actor?.admin!==true||typeof actor.uid!=='string'||!actor.uid)fail('MEMBER_MANAGEMENT_FORBIDDEN',403);
    const memberId=String(input?.member_id||'').trim(),date=String(input?.withdrawn_date||'').trim();
    if(!ID.test(memberId)||!DATE.test(date)||Object.keys(input||{}).some(k=>!['member_id','withdrawn_date'].includes(k)))fail('INVALID_MEMBER_MANAGEMENT_INPUT');
    return db.runTransaction(async tx=>{
      const ref=db.collection('members').doc(memberId),snap=await tx.get(ref);
      if(!snap.exists)fail('MEMBER_NOT_FOUND',404);
      tx.update(ref,{status:'退会',withdrawn_date:date});
      return {ok:true,member_id:memberId,status:'退会',withdrawn_date:date};
    });
  }
  async function saveGroup(input,actor){
    if(actor?.admin!==true||typeof actor.uid!=='string'||!actor.uid)fail('MEMBER_MANAGEMENT_FORBIDDEN',403);
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['billing_group_id','member_ids','membership_fee_type','plan_id','create_new'].includes(k)))fail('INVALID_MEMBER_GROUP_INPUT');
    const groupId=String(input.billing_group_id||'').trim(),planId=String(input.plan_id||'').trim(),feeType=String(input.membership_fee_type||'').trim();
    const memberIds=Array.isArray(input.member_ids)?[...new Set(input.member_ids.map(v=>String(v||'').trim()))]:[];
    if(!ID.test(groupId)||(planId&&!ID.test(planId))||!feeType||feeType.length>128||memberIds.length<1||memberIds.length>5||memberIds.some(id=>!ID.test(id)))fail('INVALID_MEMBER_GROUP_INPUT');
    return db.runTransaction(async tx=>{
      const refs=memberIds.map(id=>db.collection('members').doc(id));
      const selected=await Promise.all(refs.map(ref=>tx.get(ref)));
      if(selected.some(s=>!s.exists))fail('MEMBER_NOT_FOUND',404);
      const existing=await tx.get(db.collection('members').where('billing_group_id','==',groupId));
      const existingDocs=existing.docs||[];
      if(input.create_new===true&&existingDocs.length)fail('BILLING_GROUP_ALREADY_EXISTS',409);
      const all=new Map(existingDocs.map(doc=>[doc.id,doc.data()]));
      selected.forEach((snap,index)=>all.set(memberIds[index],snap.data()));
      if(all.size<1||all.size>5)fail('INVALID_MEMBER_GROUP_SIZE',409);
      const types=[...new Set([...all.values()].map(row=>String(row.member_type||'').trim()))];
      if(types.some(v=>!v))fail('MEMBER_GROUP_TYPE_UNAVAILABLE',409);
      for(const type of types){
        const rules=await tx.get(db.collection('plan_selection_rules').where('member_type','==',type));
        let allowed=false;
        for(const rule of rules.docs||[]){
          const allowedPlan=String(rule.data().selectable_plan_id||'').trim();if(!ID.test(allowedPlan))continue;
          const fee=await tx.get(db.collection('fees').doc(allowedPlan));
          if(fee.exists&&String(fee.data().membership_fee_type||'').trim()===feeType){allowed=true;break;}
        }
        if(!allowed)fail('MEMBER_GROUP_FEE_TYPE_MISMATCH',409);
      }
      if(planId){const candidate=await tx.get(db.collection('fees').doc(planId));if(!candidate.exists||String(candidate.data().membership_fee_type||'').trim()!==feeType||Number(candidate.data().applicable_member_count)!==all.size)fail('MEMBER_GROUP_PLAN_COUNT_MISMATCH',409);}
      refs.forEach(ref=>tx.update(ref,{billing_group_id:groupId}));
      return {ok:true,billing_group_id:groupId,member_ids:memberIds,plan_id:planId,membership_fee_type:feeType,group_size:all.size};
    });
  }
  return {save,saveGroup,withdraw};
}
module.exports={createMemberManagementCommand,normalizeMember};
