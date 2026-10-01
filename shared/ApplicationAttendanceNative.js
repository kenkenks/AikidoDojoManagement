'use strict';
const {createCore,backend}=require('./DAO_Core.js');
const {createDao}=require('./DAO_Business.js');
const attendance=require('./AttendanceNative.js');

function createApplication(config={},dependencies={}) {
  const core=createCore(config,dependencies);
  const dao=createDao(core,backend);

  function registerAttendanceCore(options) {
    const facts=attendance.collectAttendanceFacts(dao);
    const plan=attendance.makeAttendancePlan(options,facts,{
      uuid:dependencies.uuid,
      now:dependencies.now,
      dateKey:dependencies.dateKey
    });
    if(!plan.result || plan.result.ok!==true) return plan.result;
    attendance.recordAttendancePlan(plan,options,dao,{uuid:dependencies.uuid,now:dependencies.now});
    return attendance.postAttendancePlan(plan,{projectAttendances:dependencies.projectAttendances});
  }

  return {registerAttendanceCore};
}
module.exports={createApplication};
