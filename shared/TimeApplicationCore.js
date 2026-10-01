'use strict';
const {createSystemContext}=require('./SystemContext.js');
const {runSteps}=require('./Flow.js');
const time=require('./TimeTravel.js');

// Application layer with its DAO supplied by the composition root.
function createApplication(dao, dependencies={}) {
  const execute=fn=>runSteps((function*(){
    const ctx=yield createSystemContext(dao,dependencies);
    return yield fn(ctx);
  })());
  return {
    getSystemContext:()=>execute(time.getSystemContext),
    getTimeTravel:()=>execute(time.getAdminSetting),
    saveTimeTravel:input=>execute(ctx=>time.saveAdminSetting(ctx,input))
  };
}
module.exports={createApplication};
