'use strict';
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const clean=value=>String(value??'').trim();
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function createPendingAttendanceApproval(db,{serverTimestamp=()=>new Date()}={}){
  if(!db||typeof db.collection!=='function'||typeof db.runTransaction!=='function')throw TypeError('FIRESTORE_REQUIRED');
  async function list(input={}){
    const date=clean(input.attendance_date);
    if(date&&!validDate(date))throw Object.assign(Error('INVALID_PENDING_ATTENDANCE_PARAMS'),{status:400});
    let query=db.collection('attendances').where('状態','==','確認待ち');
    if(date)query=query.where('稽古日','==',date);
    const snapshot=await query.limit(201).get();
    if(snapshot.docs.length>200)throw Error('PENDING_ATTENDANCE_LIMIT');
    const memberIds=[...new Set(snapshot.docs.map(doc=>clean(doc.data()?.member_id)).filter(Boolean))];
    const members=new Map();
    await Promise.all(memberIds.map(async id=>{if(!ID.test(id))throw Error('INVALID_PENDING_ATTENDANCE_MEMBER');const doc=await db.collection('members').doc(id).get();members.set(id,doc.exists?doc.data():null);}));
    const items=snapshot.docs.map(doc=>{const row=doc.data()||{},memberId=clean(row.member_id);if(clean(row.attendance_id)!==doc.id)throw Error('PENDING_ATTENDANCE_IDENTITY_CONFLICT');return {
      attendance_id:doc.id,member_id:memberId,member_name:clean(members.get(memberId)?.member_name)||memberId,
      attendance_date:clean(row['稽古日']),duration_minutes:Number(row['稽古時間分']||60),slot_id:clean(row.slot_id),
      location_id:clean(row.location_id),billing_block_id:clean(row.billing_block_id),status:'確認待ち'
    };}).sort((a,b)=>a.attendance_date.localeCompare(b.attendance_date)||a.member_id.localeCompare(b.member_id)||a.slot_id.localeCompare(b.slot_id));
    return {ok:true,status:'確認待ち',count:items.length,attendance_items:items};
  }
  async function confirm(input={},actor={}){
    const attendanceId=clean(input.attendance_id),teacherId=clean(actor.teacher_id);
    if(!ID.test(attendanceId)||!ID.test(teacherId))throw Object.assign(Error('INVALID_PENDING_CONFIRM_PARAMS'),{status:400});
    return db.runTransaction(async tx=>{
      const ref=db.collection('attendances').doc(attendanceId),doc=await tx.get(ref);
      if(!doc.exists)throw Object.assign(Error('PENDING_ATTENDANCE_NOT_FOUND'),{status:404});
      const row=doc.data()||{};
      if(clean(row.attendance_id)!==attendanceId)throw Error('PENDING_ATTENDANCE_IDENTITY_CONFLICT');
      const status=clean(row['状態']);
      if(status==='確認済')return {ok:true,attendance_id:attendanceId,confirmed_count:0,already_confirmed:true,status};
      if(status!=='確認待ち')throw Object.assign(Error('ATTENDANCE_NOT_PENDING'),{status:409});
      tx.set(ref,{'状態':'確認済',teacher_id:teacherId,'備考':'先生確認済',approved_at:serverTimestamp()},{merge:true});
      return {ok:true,attendance_id:attendanceId,confirmed_count:1,already_confirmed:false,status:'確認済',teacher_id:teacherId};
    });
  }
  return {list,confirm};
}
module.exports={createPendingAttendanceApproval};
