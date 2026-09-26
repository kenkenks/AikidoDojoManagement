'use strict';
const {createAttendanceLogic}=require('./LegacyAttendance.js');
const time=require('./TimeTravel.js');
const {tableDefinitions}=require('./DAO_Definitions.js');
function planAttendance(options,ctx,tables,uuid) {
  const writes=[];
  const format=ctx.formatDate||time.format;
  const deps={
    ensureSheetContext:value=>value,
    Utilities:{getUuid:uuid,formatDate:format},Session:{getScriptTimeZone:()=>ctx.timezone},
    sup_now:()=>time.now(ctx),sup_today:()=>time.today(ctx),sup_targetMonth:()=>time.targetMonth(ctx),
    getMembers:()=>tables.members,getTeachers:()=>tables.teachers,getLocations:()=>tables.locations,
    getBillingBlocks:()=>tables.billingBlocks,getTrainingSlots:()=>tables.trainingSlots,
    daoContext_:value=>value,
    daoCore_:()=>({read:name=>tables[name],readAttendanceScopeRows:()=>tables.attendances}),
    cancelAttendanceRows:(rows,teacher,reason)=>{const at=time.now(ctx); for(const row of rows) writes.push({kind:'update',row,values:{'状態':'取消','取消日時':at,'取消者teacher_id':teacher,'取消理由':reason}});},
    appendAttendanceRows:rows=>{for(const row of rows) writes.push({kind:'append',row});},
    paymentStatusView_projectAttendances_:(appended,cancelled)=>writes.push({kind:'projection',appended,cancelled})
  };
  const result=createAttendanceLogic(deps)(options,ctx);
  return {result,writes};
}
module.exports={planAttendance,tableDefinitions};
