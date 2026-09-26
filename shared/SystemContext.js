'use strict';
const {runSteps} = require('./Flow.js');
// 設定名を一覧化。保存はこの順番で行う（GASと同じ）。
const settingNames = ['TIME_TRAVEL_ENABLED','DEBUG_DATE','DEBUG_TARGET_MONTH','DEBUG'];
function createSystemContext(dao, { timezone = 'Asia/Tokyo', clock = () => new Date(), formatDate } = {}) { return runSteps((function* () {
  const ctx = {dao, timezone, clock, formatDate, settings:{}, cache:{}};
  yield reloadSettings(ctx);
  return ctx;
})()); }
function reloadSettings(ctx) { return runSteps((function* () {
  const settings = {};
  for (const key of settingNames) {
    const row = yield ctx.dao.readById('setting',key);
    if (row !== null) {
      if (row.key !== key || (!['string','boolean','number'].includes(typeof row.value) && !(row.value instanceof Date))) throw new Error('INVALID_SETTING');
      settings[key] = row.value;
    }
  }
  ctx.settings = settings;
})()); }
module.exports = {createSystemContext,reloadSettings,settingNames};
