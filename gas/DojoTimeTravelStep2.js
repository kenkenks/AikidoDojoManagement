/* Step 2D generated GAS artifact. Do not edit. */
var DojoTimeTravelStep2=(function(){const modules={"./Flow.js":function(module,exports,require){
'use strict';
// 同じ手順を同期DAO（GAS）と非同期DAO（Node）の両方で実行する。
function runSteps(iterator) {
  function advance(method, value) {
    let step = iterator[method](value);
    while (!step.done) {
      if (step.value && typeof step.value.then === 'function') return step.value.then(value => advance('next', value), error => advance('throw', error));
      step = iterator.next(step.value);
    }
    return step.value;
  }
  return advance('next');
}
module.exports = { runSteps };

},
"./StorageId.js":function(module,exports,require){
'use strict';
function byteLength(value) { return encodeURIComponent(value).replace(/%[A-F\d]{2}|./g,'x').length; }
function normalizeStorageId(value) {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[\/\\\x00-\x1f]/.test(value) || byteLength(value)>1500) throw new Error('INVALID_STORAGE_ID');
  return value;
}
module.exports = {normalizeStorageId,byteLength};

},
"./DAO_Definitions.js":function(module,exports,require){
'use strict';
// Step 1: Portable DAO generic registry only. Business feature definitions are added in later patches.
const definitions = {
  setting: {
    writable: ['key', 'value'],
    sources: {
      firestore: { collection: 'settings', keyField: 'key', fields: { key: 'key', value: 'value' } },
      gas: { sheet: '99_設定', keyColumn: 1, valueColumn: 2, keyField: 'key', fields: { key: 'key', value: 'value' } }
    }
  }
};
module.exports = { definitions };

},
"./DAO_Business.js":function(module,exports,require){
'use strict';
const { definitions } = require('./DAO_Definitions.js');
const { normalizeStorageId } = require('./StorageId.js');
const { runSteps } = require('./Flow.js');

// 名前で定義を選択し、共通の読取・項目対応を実行する。
function createDao(core, backend, registry = definitions) {
  function resolve(name, recordId) {
    if (!Object.hasOwn(registry, name)) throw new Error('UNKNOWN_DAO_NAME');
    const definition = registry[name];
    if (!Object.hasOwn(definition.sources, backend)) throw new Error('UNKNOWN_DAO_SOURCE');
    const source = definition.sources[backend];
    const id = (definition.normalizeId || normalizeStorageId)(recordId);
    return {definition, source, id};
  }
  function write(method, name, recordId, values) {
    const {definition, source, id} = resolve(name, recordId);
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('INVALID_WRITE_VALUES');
    const fields = Object.fromEntries(Object.entries(values).map(([key,value]) => {
      if (!definition.writable?.includes(key) || !Object.hasOwn(source.fields,key)) throw new Error('FIELD_NOT_WRITABLE');
      if (source.fields[key] === source.keyField && value !== id) throw new Error('KEY_MISMATCH');
      return [source.fields[key],value];
    }));
    if (method === 'append') fields[source.keyField] = id;
    return core[method](source,id,fields);
  }
  return {
    append: (name,id,values) => write('append',name,id,values),
    updateByKey: (name,id,values) => write('updateByKey',name,id,values),
    readById(name, recordId) { return runSteps((function* () {
    const {definition, source, id} = resolve(name, recordId);
    const row = yield core.readById(source, id);
    if (row === null) return null;
    const mapped = Object.fromEntries(Object.entries(source.fields).map(([field, storedField]) => {
      const value = row[storedField];
      return [field, Object.hasOwn(source.transforms || {}, field) ? source.transforms[field](value) : value];
    }));
    return definition.validate ? definition.validate(mapped, id) : mapped;
  })()); } };
}
module.exports = { createDao };

},
"./SystemContext.js":function(module,exports,require){
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

},
"./TimeTravel.js":function(module,exports,require){
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

},
"./TimeApplicationStep2.js":function(module,exports,require){
'use strict';
const {createCore,backend}=require('./DAO_Core.js');
const {createDao}=require('./DAO_Business.js');
const {createSystemContext}=require('./SystemContext.js');
const {runSteps}=require('./Flow.js');
const time=require('./TimeTravel.js');

function createApplication(config={}, dependencies) {
  // GAS Step 2-A+B compatibility: one argument was dependencies.
  if (dependencies === undefined && (config.spreadsheet || config.timezone || config.clock || config.formatDate)) {
    dependencies=config; config={};
  }
  dependencies=dependencies||{};
  const dao=createDao(createCore(config,dependencies),backend);
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

},
"./DAO_Core.js":function(module,exports,require){
'use strict';
function createCore(config, dependencies = {}) {
  const ss = dependencies.spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  function locate(source,id,reading=false) {
    const sheet=ss.getSheetByName(source.sheet);
    if(!sheet) {if(reading)return {values:[],row:0};throw new Error(source.sheet+'シートがありません。');}
    const values=sheet.getDataRange().getValues();
    let row=0;
    for(let i=1;i<values.length;i++) if(String(values[i][source.keyColumn-1]||'').trim()===id) row=i+1;
    return {sheet,values,row};
  }
  return {
    readById(source,id) { const {values,row}=locate(source,id,true); return row ? {key:id,value:values[row-1][source.valueColumn-1] ?? ''} : null; },
    updateByKey(source,id,values) { const {sheet,row}=locate(source,id); if(!row) return {found:false}; sheet.getRange(row,source.valueColumn).setNumberFormat('@').setValue(values.value); return {found:true}; },
    append(source,id,values) { const {sheet}=locate(source,id); const row=sheet.getLastRow()+1; sheet.getRange(row,source.keyColumn).setValue(id); sheet.getRange(row,source.valueColumn).setNumberFormat('@').setValue(values.value); }
  };
}
module.exports={createCore,backend:'gas'};

}};const cache={};function require(name){if(!Object.prototype.hasOwnProperty.call(modules,name))throw new Error(name);if(!cache[name]){const m={exports:{}};cache[name]=m;modules[name](m,m.exports,require);}return cache[name].exports;}return require("./TimeApplicationStep2.js");})();
