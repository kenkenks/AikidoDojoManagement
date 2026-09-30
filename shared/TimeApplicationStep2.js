'use strict';
const {createCore,backend}=require('./DAO_Core.js');
const {createDao}=require('./DAO_Business.js');
const {definitions}=require('./DAO_Definitions.js');
const {createSystemContext}=require('./SystemContext.js');
const {runSteps}=require('./Flow.js');
const time=require('./TimeTravel.js');

function createApplication(config={}, dependencies) {
  // GAS Step 2-A+B compatibility: one argument was dependencies.
  if (dependencies === undefined && (config.spreadsheet || config.timezone || config.clock || config.formatDate)) {
    dependencies=config; config={};
  }
  dependencies=dependencies||{};

  let registry=dependencies.registry;
  if (!registry && config.settingCollection) {
    registry={
      ...definitions,
      setting:{
        ...definitions.setting,
        sources:{
          ...definitions.setting.sources,
          firestore:{
            ...definitions.setting.sources.firestore,
            collection:config.settingCollection
          }
        }
      }
    };
  }

  const dao=createDao(createCore(config,dependencies),backend,registry);
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
