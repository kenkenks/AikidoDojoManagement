'use strict';
const {createCore,backend}=require('./DAO_Core.js');
const {createDao}=require('./DAO_Business.js');
const {createSystemContext}=require('./SystemContext.js');
const time=require('./TimeTravel.js');
const {runSteps}=require('./Flow.js');
const {planAttendance}=require('./Attendance.js');
function createApplication(config={},dependencies={}) {
  const core=createCore(config,dependencies);
  const dao=createDao(core,backend);
  function execute(callback) {return runSteps((function*(){
    const ctx=yield createSystemContext(dao,dependencies);
    return yield callback(ctx);
  })());}
  function registerAttendanceCore(options) {
    return execute(ctx=>{
      if(typeof dependencies.uuid!=='function') throw new Error('UUID_PROVIDER_REQUIRED');
      return core.withAttendance(tables=>planAttendance(options,ctx,tables,dependencies.uuid));
    });
  }
  return {
    getSystemContext:()=>execute(time.getSystemContext),
    getTimeTravel:()=>execute(time.getAdminSetting),
    saveTimeTravel:input=>execute(ctx=>time.saveAdminSetting(ctx,input)),
    registerAttendanceCore
  };
}
module.exports={createApplication};
