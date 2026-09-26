'use strict';
const {reloadSettings} = require('./SystemContext.js');
const {runSteps} = require('./Flow.js');
function format(date, timezone, pattern) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(date).map(p => [p.type,p.value]));
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, token => parts[{yyyy:'year',MM:'month',dd:'day',HH:'hour',mm:'minute',ss:'second'}[token]]);
}
function ctxFormat(ctx,date,pattern) { return (ctx.formatDate || format)(date,ctx.timezone,pattern); }
function normalizeMonth(value,ctx) { return value instanceof Date ? ctxFormat(ctx,value,'yyyy-MM') : String(value).trim(); }
function getSetting(ctx) {
  const s = ctx.settings;
  return {enabled:String(s.TIME_TRAVEL_ENABLED).toUpperCase()==='TRUE',now:s.DEBUG_DATE||'',targetMonth:s.DEBUG_TARGET_MONTH ? normalizeMonth(s.DEBUG_TARGET_MONTH,ctx) : '',debug:String(s.DEBUG).toUpperCase()==='TRUE'};
}
function now(ctx) { const s=getSetting(ctx); return s.enabled && s.now ? new Date(s.now) : new Date(ctx.clock()); }
function today(ctx) { return ctxFormat(ctx,now(ctx),'yyyy-MM-dd'); }
function targetMonth(ctx) { const s=getSetting(ctx); return s.enabled && s.targetMonth ? s.targetMonth : ctxFormat(ctx,now(ctx),'yyyy-MM'); }
function getSystemContext(ctx) { return {ok:true,time_travel_enabled:getSetting(ctx).enabled,system_now:ctxFormat(ctx,now(ctx),'yyyy-MM-dd HH:mm:ss'),target_month:targetMonth(ctx),timezone:ctx.timezone}; }
function getAdminSetting(ctx) {
  const s=getSetting(ctx);
  return {ok:true,enabled:s.enabled,now:s.now && !isNaN(new Date(s.now).getTime()) ? new Date(s.now).toISOString() : '',target_month:s.targetMonth||'',effective:getSystemContext(ctx)};
}
function saveAdminSetting(ctx,input={}) { return runSteps((function* () {
  input=input||{};
  const enabled=input.enabled===true || String(input.enabled).toUpperCase()==='TRUE';
  const debugDate=enabled ? String(input.now||'').trim() : '';
  const month=enabled ? normalizeMonth(input.target_month||'',ctx) : '';
  if (enabled && (!debugDate || isNaN(new Date(debugDate).getTime()))) return {ok:false,message:'有効にする場合はテスト日時を指定してください。'};
  if (enabled && !/^\d{4}-\d{2}$/.test(month)) return {ok:false,message:'有効にする場合は対象月を指定してください。'};
  const updates={TIME_TRAVEL_ENABLED:enabled?'TRUE':'FALSE',DEBUG_DATE:debugDate,DEBUG_TARGET_MONTH:month};
  for (const [key,value] of Object.entries(updates)) {
    const result=yield ctx.dao.updateByKey('setting',key,{value});
    if (!result.found) yield ctx.dao.append('setting',key,{value});
  }
  yield reloadSettings(ctx);
  return {ok:true,message:enabled?'テスト時刻を有効にしました。':'実時刻へ戻しました。',effective:getSystemContext(ctx)};
})()); }
module.exports={now,today,targetMonth,getSetting,getSystemContext,getAdminSetting,saveAdminSetting,format};
