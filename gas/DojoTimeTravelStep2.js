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
  },
  monthlySelection: {
    writable: ['target_month','member_id','billing_group_id','plan_id','宣言日','状態','備考'],
    sources: {
      firestore: { collection: 'monthlySelections', fields: { target_month:'target_month', member_id:'member_id', billing_group_id:'billing_group_id', plan_id:'plan_id', 宣言日:'宣言日', 状態:'状態', 備考:'備考' } },
      gas: { sheet: '04_月次選択', fields: { target_month:'target_month', member_id:'member_id', billing_group_id:'billing_group_id', plan_id:'plan_id', 宣言日:'宣言日', 状態:'状態', 備考:'備考' } }
    }
  },
  invoice: {
    writable: ['invoice_id','target_month','billing_group_id','member_id','plan_id','請求種別','表示名','数量','単価','上限金額','計算額','請求予定額','金額','支払状態','支払期限','作成日','備考'],
    sources: {
      firestore: { collection: 'invoices', keyField: 'invoice_id', fields: { invoice_id:'invoice_id', target_month:'target_month', billing_group_id:'billing_group_id', member_id:'member_id', plan_id:'plan_id', 請求種別:'請求種別', 表示名:'表示名', 数量:'数量', 単価:'単価', 上限金額:'上限金額', 計算額:'計算額', 請求予定額:'請求予定額', 金額:'金額', 支払状態:'支払状態', 支払期限:'支払期限', 作成日:'作成日', 備考:'備考' } },
      gas: { sheet: '05_請求明細', keyField: 'invoice_id', fields: { invoice_id:'invoice_id', target_month:'target_month', billing_group_id:'billing_group_id', member_id:'member_id', plan_id:'plan_id', 請求種別:'請求種別', 表示名:'表示名', 数量:'数量', 単価:'単価', 上限金額:'上限金額', 計算額:'計算額', 請求予定額:'請求予定額', 金額:'金額', 支払状態:'支払状態', 支払期限:'支払期限', 作成日:'作成日', 備考:'備考' } }
    }
  },
  paymentLog: {
    writable: ['payment_id','日時','target_month','billing_group_id','invoice_id','member_id','支払方法','入金額','決済ID','備考','reception_date','location_id','billing_block_id','teacher_id','reception_session_id'],
    sources: {
      firestore: { collection: 'payments', fields: { payment_id:'payment_id', 日時:'日時', target_month:'target_month', billing_group_id:'billing_group_id', invoice_id:'invoice_id', member_id:'member_id', 支払方法:'支払方法', 入金額:'入金額', 決済ID:'決済ID', 備考:'備考', reception_date:'reception_date', location_id:'location_id', billing_block_id:'billing_block_id', teacher_id:'teacher_id', reception_session_id:'reception_session_id' } },
      // GAS 06_入金ログ: base 9列 + paymentReception_ensureSchema() のScope 5列。member_idは物理列ではない。
      gas: { sheet: '06_入金ログ', fields: { payment_id:'payment_id', 日時:'日時', target_month:'target_month', billing_group_id:'billing_group_id', invoice_id:'invoice_id', 支払方法:'支払方法', 入金額:'入金額', 決済ID:'決済ID', 備考:'備考', reception_date:'reception_date', location_id:'location_id', billing_block_id:'billing_block_id', teacher_id:'teacher_id', reception_session_id:'reception_session_id' } }
    }
  },
  members: {
    writable: [],
    sources: {
      firestore: { collection: 'members', fields: { member_id:'member_id', 状態:'状態' } },
      gas: { sheet: '01_会員マスタ', fields: { member_id:'member_id', 状態:'状態' } }
    }
  },
  teachers: {
    writable: [],
    sources: {
      firestore: { collection: 'teachers', fields: { teacher_id:'teacher_id', 状態:'状態', 出席受付可:'出席受付可' } },
      gas: { sheet: '11_先生マスタ', fields: { teacher_id:'teacher_id', 状態:'状態', 出席受付可:'出席受付可' } }
    }
  },
  locations: {
    writable: [],
    sources: {
      firestore: { collection: 'locations', fields: { location_id:'location_id', 状態:'状態' } },
      gas: { sheet: '10_道場マスタ', fields: { location_id:'location_id', 状態:'状態' } }
    }
  },
  billingBlocks: {
    writable: [],
    sources: {
      firestore: { collection: 'billingBlocks', fields: { billing_block_id:'billing_block_id', location_id:'location_id', 状態:'状態' } },
      gas: { sheet: '13_課金枠マスタ', fields: { billing_block_id:'billing_block_id', location_id:'location_id', 状態:'状態' } }
    }
  },
  trainingSlots: {
    writable: [],
    sources: {
      firestore: { collection: 'trainingSlots', fields: { slot_id:'slot_id', location_id:'location_id', billing_block_id:'billing_block_id', 稽古時間分:'稽古時間分', 状態:'状態' } },
      gas: { sheet: '12_稽古枠マスタ', fields: { slot_id:'slot_id', location_id:'location_id', billing_block_id:'billing_block_id', 稽古時間分:'稽古時間分', 状態:'状態' } }
    }
  },
  attendance: {
    writable: ['attendance_id','稽古日','登録日時','member_id','target_month','location_id','slot_id','billing_block_id','teacher_id','attendance_session_id','稽古時間分','状態','source','取消日時','取消者teacher_id','取消理由','備考'],
    sources: {
      firestore: { collection: 'attendances', keyField: 'attendance_id', fields: { attendance_id:'attendance_id', 稽古日:'稽古日', 登録日時:'登録日時', member_id:'member_id', target_month:'target_month', location_id:'location_id', slot_id:'slot_id', billing_block_id:'billing_block_id', teacher_id:'teacher_id', attendance_session_id:'attendance_session_id', 稽古時間分:'稽古時間分', 状態:'状態', source:'source', 取消日時:'取消日時', 取消者teacher_id:'取消者teacher_id', 取消理由:'取消理由', 備考:'備考' } },
      gas: { sheet: '07_出席ログ', keyField: 'attendance_id', fields: { attendance_id:'attendance_id', 稽古日:'稽古日', 登録日時:'登録日時', member_id:'member_id', target_month:'target_month', location_id:'location_id', slot_id:'slot_id', billing_block_id:'billing_block_id', teacher_id:'teacher_id', attendance_session_id:'attendance_session_id', 稽古時間分:'稽古時間分', 状態:'状態', source:'source', 取消日時:'取消日時', 取消者teacher_id:'取消者teacher_id', 取消理由:'取消理由', 備考:'備考' } }
    }
  },
  paymentEvidence: {
    writable: ['evidence_id','invoice_id','member_id','payment_method','amount','reception_date','status','evidence_code','requested_at','confirmed_at','confirmed_by','posted_at','payment_log_id','remarks'],
    sources: {
      firestore: { collection: 'paymentEvidences', keyField: 'evidence_id', fields: {
        evidence_id:'evidence_id', invoice_id:'invoice_id', member_id:'member_id', payment_method:'payment_method', amount:'amount', reception_date:'reception_date', status:'status', evidence_code:'evidence_code', requested_at:'requested_at', confirmed_at:'confirmed_at', confirmed_by:'confirmed_by', posted_at:'posted_at', payment_log_id:'payment_log_id', remarks:'remarks'
      } },
      gas: { sheet: '09_決済エビデンス', keyColumn: 1, keyField: 'evidence_id', fields: {
        evidence_id:'evidence_id', invoice_id:'invoice_id', member_id:'member_id', payment_method:'payment_method', amount:'amount', reception_date:'reception_date', status:'status', evidence_code:'evidence_code', requested_at:'requested_at', confirmed_at:'confirmed_at', confirmed_by:'confirmed_by', posted_at:'posted_at', payment_log_id:'payment_log_id', remarks:'remarks'
      } }
    }
  }
};
const tableDefinitions = {
  members: { sheet: '01_会員マスタ', collection: 'members' },
  locations: { sheet: '10_道場マスタ', collection: 'locations' },
  teachers: { sheet: '11_先生マスタ', collection: 'teachers' },
  trainingSlots: { sheet: '12_稽古枠マスタ', collection: 'trainingSlots' },
  billingBlocks: { sheet: '13_課金枠マスタ', collection: 'billingBlocks' },
  attendances: { sheet: '07_出席ログ', collection: 'attendances' }
};
module.exports = { definitions, tableDefinitions };

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
    if (method === 'append' || method === 'upsertByKey') fields[source.keyField] = id;
    return core[method](source,id,fields);
  }

  function mapWriteFields(definition, source, values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('INVALID_WRITE_VALUES');
    return Object.fromEntries(Object.entries(values).map(([key,value]) => {
      if (!definition.writable?.includes(key) || !Object.hasOwn(source.fields,key)) throw new Error('FIELD_NOT_WRITABLE');
      return [source.fields[key],value];
    }));
  }
  function appendRecord(name, values) {
    if (!Object.hasOwn(registry, name)) throw new Error('UNKNOWN_DAO_NAME');
    const definition=registry[name];
    if (!Object.hasOwn(definition.sources, backend)) throw new Error('UNKNOWN_DAO_SOURCE');
    const source=definition.sources[backend];
    return core.appendRecord(source,mapWriteFields(definition,source,values));
  }
  function readAll(name) {
    if (!Object.hasOwn(registry, name)) throw new Error('UNKNOWN_DAO_NAME');
    const definition=registry[name];
    if (!Object.hasOwn(definition.sources, backend)) throw new Error('UNKNOWN_DAO_SOURCE');
    const source=definition.sources[backend];
    return runSteps((function* () {
      const rows=yield core.readAll(source);
      return rows.map(row=>Object.fromEntries(Object.entries(source.fields).map(([field,storedField])=>[field,row[storedField]])));
    })());
  }
  return {
    appendRecord,
    readAll,
    append: (name,id,values) => write('append',name,id,values),
    updateByKey: (name,id,values) => write('updateByKey',name,id,values),
    upsertByKey: (name,id,values) => write('upsertByKey',name,id,values),
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
    yield ctx.dao.upsertByKey('setting',key,{value});
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
const {tableDefinitions}=require('./DAO_Definitions.js');
function createCore(config, dependencies = {}) {
  const ss = dependencies.spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  function locate(source,id,reading=false) {
    const sheet=ss.getSheetByName(source.sheet);
    if(!sheet) {if(reading)return {values:[],row:0};throw new Error(source.sheet+'シートがありません。');}
    const values=sheet.getDataRange().getValues();
    const headers=(values[0]||[]).map(value=>String(value).trim());
    // Legacy definitions may provide keyColumn, while newer Portable tables use keyField.
    // Resolve the physical key column from the header when keyColumn is absent.
    let keyIndex=-1;
    if(Number.isInteger(source.keyColumn) && source.keyColumn>0) keyIndex=source.keyColumn-1;
    else if(source.keyField) keyIndex=headers.indexOf(String(source.keyField).trim());
    if(keyIndex<0) throw new Error(source.sheet+' にキー列がありません: '+String(source.keyField||source.keyColumn||''));
    let row=0;
    for(let i=1;i<values.length;i++) if(String(values[i][keyIndex]||'').trim()===String(id).trim()) row=i+1;
    return {sheet,values,row};
  }
  return {
    readAll(source) {
      const sheet=ss.getSheetByName(source.sheet);
      if(!sheet) throw new Error(source.sheet+'シートがありません。');
      const values=sheet.getDataRange().getValues();
      if(values.length===0) return [];
      const headers=(values[0]||[]).map(value=>String(value).trim());
      return values.slice(1).filter(row=>row.some(cell=>cell!==''))
        .map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]])));
    },
    appendRecord(source,values) {
      const sheet=ss.getSheetByName(source.sheet);
      if(!sheet) throw new Error(source.sheet+'シートがありません。');
      const lastColumn=sheet.getLastColumn();
      if(!lastColumn) throw new Error(source.sheet+' にヘッダーがありません。');
      const headers=sheet.getRange(1,1,1,lastColumn).getValues()[0].map(value=>String(value).trim());
      for(const field of Object.keys(values)) if(!headers.includes(field)) throw new Error(source.sheet+' に列がありません: '+field);
      const row=headers.map(header=>Object.hasOwn(values,header)?values[header]:'');
      const newRow=sheet.getLastRow()+1;
      // Google Sheets can auto-coerce string identifiers such as "2099-07" or
      // "2099-07-01" into Date values. Portable DAO must preserve the caller's
      // value type, so mark only supplied string cells as plain text before writing.
      // Numeric/boolean cells keep their native Sheets types.
      for(let column=0;column<headers.length;column++) {
        if(Object.hasOwn(values,headers[column]) && typeof row[column]==='string')
          sheet.getRange(newRow,column+1).setNumberFormat('@');
      }
      sheet.getRange(newRow,1,1,headers.length).setValues([row]);
      return {appended:true};
    },
    readById(source,id) {
      const {values,row}=locate(source,id,true);
      if(!row) return null;
      const headers=(values[0]||[]).map(value=>String(value).trim());
      const stored={};
      for(const field of Object.values(source.fields||{})) {
        const column=headers.indexOf(field);
        if(column>=0) stored[field]=values[row-1][column];
      }
      return stored;
    },
    updateByKey(source,id,values) {
      const {sheet,values:rows,row}=locate(source,id);
      if(!row) return {found:false};
      const headers=(rows[0]||[]).map(value=>String(value).trim());
      const nextRow=rows[row-1].slice();
      for(const [field,value] of Object.entries(values)) {
        if(field===source.keyField) continue;
        const column=headers.indexOf(field);
        if(column<0) throw new Error(source.sheet+' に列がありません: '+field);
        nextRow[column]=value;
      }
      // One row write preserves the existing CONFIRMED transition atomicity on real Sheets.
      // Legacy Node Sheet mocks expose only single-cell setValue; keep that test seam compatible.
      const rowRange=sheet.getRange(row,1,1,nextRow.length);
      if(rowRange && typeof rowRange.setValues==='function') rowRange.setValues([nextRow]);
      else for(const [field,value] of Object.entries(values)) {
        if(field===source.keyField) continue;
        const column=headers.indexOf(field);
        sheet.getRange(row,column+1).setValue(value);
      }
      return {found:true};
    },
    upsertByKey(source,id,values) { const {sheet,row}=locate(source,id); if(row) { sheet.getRange(row,source.valueColumn).setNumberFormat('@').setValue(values.value); return {created:false,updated:true}; } const newRow=sheet.getLastRow()+1; sheet.getRange(newRow,source.keyColumn).setValue(id); sheet.getRange(newRow,source.valueColumn).setNumberFormat('@').setValue(values.value); return {created:true,updated:false}; },
    append(source,id,values) { const {sheet}=locate(source,id); const row=sheet.getLastRow()+1; sheet.getRange(row,source.keyColumn).setValue(id); sheet.getRange(row,source.valueColumn).setNumberFormat('@').setValue(values.value); },
    
  };
}
module.exports={createCore,backend:'gas'};

}};const cache={};function require(name){if(!Object.prototype.hasOwnProperty.call(modules,name))throw new Error(name);if(!cache[name]){const m={exports:{}};cache[name]=m;modules[name](m,m.exports,require);}return cache[name].exports;}return require("./TimeApplicationStep2.js");})();
