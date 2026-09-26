'use strict';
const {createCore,backend}=require('./DAO_Core.js');
const {createDao}=require('./DAO_Business.js');
const {createSystemContext}=require('./SystemContext.js');
const {runSteps}=require('./Flow.js');
const time=require('./TimeTravel.js');
function createApplication(dependencies) {
  const dao=createDao(createCore({},dependencies),backend);
  const execute=fn=>runSteps((function*(){const ctx=yield createSystemContext(dao,dependencies);return yield fn(ctx);})());
  return {getSystemContext:()=>execute(time.getSystemContext),getTimeTravel:()=>execute(time.getAdminSetting),saveTimeTravel:input=>execute(ctx=>time.saveAdminSetting(ctx,input))};
}
function fromContext(ctx,timezone,formatDate) {return time.getSystemContext({settings:ctx.settings||{},timezone,formatDate,clock:()=>new Date()});}
module.exports={createApplication,fromContext};
