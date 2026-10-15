'use strict';
const {createFirestoreProgressReader}=require('./progress-firestore.cjs');
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function createTeacherTodayReader(core,{getSystemContext,createOverview}){
  const progress=createFirestoreProgressReader(core);
  return async params=>{
    if(!ID.test(params.location_id||'') || (params.billing_block_id!=null&&!ID.test(params.billing_block_id)))throw Error('INVALID_TEACHER_SCOPE');
    const clock=await getSystemContext();
    if(clock?.ok!==true || clock.timezone!=='Asia/Tokyo' || !/^\d{4}-\d{2}-\d{2} /.test(clock.system_now||''))throw Error('SYSTEM_CONTEXT_UNAVAILABLE');
    const date=params.attendance_date||clock.system_now.slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('INVALID_ATTENDANCE_DATE');
    const filters=[{field:'location_id',value:params.location_id},{field:'稽古日',value:date}];
    if(params.billing_block_id)filters.push({field:'billing_block_id',value:params.billing_block_id});
    const rows=await core.queryEqual({collection:'attendances'},filters,{limit:500});
    if(!Array.isArray(rows)||rows.length>=500)throw Error('TEACHER_OVERVIEW_SCOPE_LIMIT');
    const ids=[...new Set(rows.filter(r=>String(r['状態']||'').trim()!=='取消').map(r=>String(r.member_id||'').trim()).filter(Boolean))];
    if(ids.length>50||ids.some(id=>!ID.test(id)))throw Error('TEACHER_OVERVIEW_MEMBER_LIMIT');
    const summaries={};for(const id of ids){const result=await progress(id);if(result.ok===true)summaries[id]=result;}
    return createOverview({rows,summaries,date})(params);
  };
}
module.exports={createTeacherTodayReader};
