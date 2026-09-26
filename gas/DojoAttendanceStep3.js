/* Generated Step 3 GAS Attendance artifact. */
var DojoAttendanceStep3=(function(){const modules={"./DAO_Definitions.js":function(module,exports,require){
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
"./StorageId.js":function(module,exports,require){
'use strict';
function byteLength(value) { return encodeURIComponent(value).replace(/%[A-F\d]{2}|./g,'x').length; }
function normalizeStorageId(value) {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[\/\\\x00-\x1f]/.test(value) || byteLength(value)>1500) throw new Error('INVALID_STORAGE_ID');
  return value;
}
module.exports = {normalizeStorageId,byteLength};

},
"./Flow.js":function(module,exports,require){
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
"./Attendance.js":function(module,exports,require){
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

},
"./ApplicationStep3.js":function(module,exports,require){
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
    let row=0;
    for(let i=1;i<values.length;i++) if(String(values[i][source.keyColumn-1]||'').trim()===id) row=i+1;
    return {sheet,values,row};
  }
  return {
    readById(source,id) { const {values,row}=locate(source,id,true); return row ? {key:id,value:values[row-1][source.valueColumn-1] ?? ''} : null; },
    updateByKey(source,id,values) { const {sheet,row}=locate(source,id); if(!row) return {found:false}; sheet.getRange(row,source.valueColumn).setNumberFormat('@').setValue(values.value); return {found:true}; },
    append(source,id,values) { const {sheet}=locate(source,id); const row=sheet.getLastRow()+1; sheet.getRange(row,source.keyColumn).setValue(id); sheet.getRange(row,source.valueColumn).setNumberFormat('@').setValue(values.value); },
    withAttendance(work) {
      // STEP3-D temporary route proof: emitted only when the Portable GAS DAO attendance path is entered.
      if(typeof console!=='undefined' && console.log) console.log('[PORTABLE-DAO] backend=gas scope=attendance event=ENTER');
      if(typeof dependencies.projectAttendances!=='function') throw new Error('ATTENDANCE_PROJECTION_REQUIRED');
      const lock=dependencies.lock || LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const tables={};
        let attendanceSheet,headers;
        for(const [name,definition] of Object.entries(tableDefinitions)) {
          const sheet=ss.getSheetByName(definition.sheet);
          if(!sheet) throw new Error(definition.sheet+'シートがありません。');
          const [columns,...rows]=sheet.getDataRange().getValues();
          tables[name]=rows.map((row,index)=>({...Object.fromEntries(columns.map((key,column)=>[key,row[column]])),_rowNumber:index+2}));
          if(name==='attendances') {attendanceSheet=sheet;headers=columns;}
        }
        const plan=work(tables);
        if(typeof console!=='undefined' && console.log) {
          const counts=(plan.writes||[]).reduce((acc,write)=>{acc[write.kind]=(acc[write.kind]||0)+1;return acc;},{});
          console.log('[PORTABLE-DAO] backend=gas scope=attendance event=PLAN writes='+JSON.stringify(counts));
        }
        if(!plan.result.ok) return plan.result;
        for(const write of plan.writes) {
          if(write.kind==='update') for(const key of Object.keys(write.values)) if(!headers.includes(key)) throw new Error('出席ログに列がありません: '+key);
          if(write.kind==='append') for(const key of ['attendance_id','稽古日','登録日時','member_id','target_month','location_id','slot_id','billing_block_id','teacher_id','attendance_session_id','稽古時間分','状態','source']) if(!headers.includes(key)) throw new Error('出席ログに列がありません: '+key);
        }
        for(const write of plan.writes) {
          if(write.kind==='update') for(const [key,value] of Object.entries(write.values)) attendanceSheet.getRange(write.row._rowNumber,headers.indexOf(key)+1).setValue(value);
          if(write.kind==='append') attendanceSheet.getRange(attendanceSheet.getLastRow()+1,1,1,headers.length).setValues([headers.map(key=>write.row[key]??'')]);
          if(write.kind==='projection') dependencies.projectAttendances(write);
        }
        if(typeof console!=='undefined' && console.log) console.log('[PORTABLE-DAO] backend=gas scope=attendance event=COMMIT ok=true');
        return plan.result;
      } finally {lock.releaseLock();}
    }
  };
}
module.exports={createCore,backend:'gas'};

},
"./LegacyAttendance.js":function(module,exports,require){
exports.createAttendanceLogic=function(deps){const {ensureSheetContext,Utilities,Session,sup_now,sup_today,sup_targetMonth,getMembers,getTeachers,getLocations,getBillingBlocks,getTrainingSlots,daoContext_,daoCore_,cancelAttendanceRows,appendAttendanceRows,paymentStatusView_projectAttendances_}=deps;
// ==============================
// 出席登録
// ==============================

const ATTENDANCE_SOURCE_QR = "github_pages_qr";

/**
 * 旧会員画面からの1件登録は、枠を特定できないため停止する。
 * 出席はQR画面から稽古枠を選択して登録する。
 */
function registerAttendance(memberId) {
  return {
    ok: false,
    member_id: memberId || "",
    message: "稽古枠の指定が必要です。QR出席画面から登録してください。"
  };
}

// doGet() で呼び出すと、JSONP形式で出席登録APIを呼び出せる。
function getAttendanceSessionInfo(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);

  if (!locationId) return { ok: false, message: "location_id が必要です。" };

  const location = getLocations(ctx).find(row =>
    normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row)
  );
  if (!location) return { ok: false, message: "有効な道場が見つかりません。" };

  const now = parseSessionDateTime_(params.at, ctx);
  const candidates = findBillingBlockCandidates_(locationId, now, ctx);

  if (billingBlockId) {
    return attachAttendanceBlockCandidates_(
      buildAttendanceSessionInfo_(location, billingBlockId, false, ctx),
      candidates
    );
  }
  const exactCandidates = candidates.filter(candidate => candidate.is_current);
  const nearbyCandidates = candidates.filter(candidate => candidate.is_nearby);

  if (exactCandidates.length === 1) {
    return attachAttendanceBlockCandidates_(
      buildAttendanceSessionInfo_(location, exactCandidates[0].billing_block_id, true, ctx),
      candidates
    );
  }
  if (exactCandidates.length === 0 && nearbyCandidates.length === 1) {
    return attachAttendanceBlockCandidates_(
      buildAttendanceSessionInfo_(location, nearbyCandidates[0].billing_block_id, true, ctx),
      candidates
    );
  }

  const choices = exactCandidates.length > 1
    ? exactCandidates
    : (nearbyCandidates.length > 0 ? nearbyCandidates : candidates);

  return {
    ok: true,
    location_id: locationId,
    location_name: String(location["表示名"] || location["道場名"] || locationId),
    requires_selection: true,
    billing_block_candidates: mapAttendanceBlockCandidates_(choices),
    message: choices.length > 0
      ? "課金枠を自動判定できませんでした。候補から選択してください。"
      : "本日の課金枠がありません。"
  };
}


function mapAttendanceBlockCandidates_(candidates) {
  return (candidates || []).map(candidate => ({
    billing_block_id: candidate.billing_block_id,
    label: candidate.label,
    start_time: candidate.start_time,
    end_time: candidate.end_time
  }));
}

function attachAttendanceBlockCandidates_(result, candidates) {
  if (!result || result.ok !== true) return result;
  result.billing_block_candidates = mapAttendanceBlockCandidates_(candidates);
  return result;
}

function buildAttendanceSessionInfo_(location, billingBlockId, inferred, ctx) {
  ctx = ensureSheetContext(ctx);
  
  const locationId = normalizeId_(location["location_id"]);
  const block = getBillingBlocks(ctx).find(row =>
    normalizeId_(row["billing_block_id"]) === billingBlockId &&
    normalizeId_(row["location_id"]) === locationId &&
    isActiveMasterRow_(row)
  );
  if (!block) return { ok: false, message: "道場に対応する有効な課金枠が見つかりません。" };

  const slots = getTrainingSlots(ctx)
    .filter(row =>
      normalizeId_(row["location_id"]) === locationId &&
      normalizeId_(row["billing_block_id"]) === billingBlockId &&
      isActiveMasterRow_(row)
    )
    .sort((a, b) => timeToMinutes_(a["開始時刻"]) - timeToMinutes_(b["開始時刻"]))
    .map(row => ({
      slot_id: normalizeId_(row["slot_id"]),
      label: String(row["表示名"] || row["slot_id"]),
      start_time: formatTimeValue_(row["開始時刻"]),
      end_time: formatTimeValue_(row["終了時刻"]),
      duration_minutes: Number(row["稽古時間分"] || 60)
    }));
  if (slots.length === 0) return { ok: false, message: "稽古枠が登録されていません。" };

  return {
    ok: true,
    requires_selection: false,
    inferred: inferred === true,
    location_id: locationId,
    location_name: String(location["表示名"] || location["道場名"] || locationId),
    billing_block_id: billingBlockId,
    billing_block_name: String(block["表示名"] || billingBlockId),
    slots_per_charge: Number(block["1課金あたり枠数"] || 2),
    slots
  };
}

function findBillingBlockCandidates_(locationId, dateTime, ctx) {
  ctx = ensureSheetContext(ctx);

  const weekday = getWeekdayLabel_(dateTime);
  const currentMinutes = timeToMinutes_(Utilities.formatDate(
    dateTime, Session.getScriptTimeZone(), "HH:mm"
  ));
  const slots = getTrainingSlots(ctx).filter(row =>
    normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row)
  );

  return getBillingBlocks(ctx).filter(block =>
    normalizeId_(block["location_id"]) === locationId &&
    isActiveMasterRow_(block) &&
    weekdayMatches_(block["曜日"], weekday)
  ).map(block => {
    const blockId = normalizeId_(block["billing_block_id"]);
    const blockSlots = slots.filter(slot => normalizeId_(slot["billing_block_id"]) === blockId);
    if (blockSlots.length === 0) return null;
    const start = Math.min.apply(null, blockSlots.map(slot => timeToMinutes_(slot["開始時刻"])));
    const end = Math.max.apply(null, blockSlots.map(slot => timeToMinutes_(slot["終了時刻"])));
    if (!isFinite(start) || !isFinite(end)) return null;
    return {
      billing_block_id: blockId,
      label: String(block["表示名"] || blockId),
      start_time: minutesToTimeText_(start),
      end_time: minutesToTimeText_(end),
      is_current: currentMinutes >= start && currentMinutes <= end,
      is_nearby: currentMinutes >= start - 30 && currentMinutes <= end
    };
  }).filter(Boolean).sort((a, b) => timeToMinutes_(a.start_time) - timeToMinutes_(b.start_time));
}

//------------------------------------------------------------------------------------------------
// doGet() で呼び出すと、JSONP形式で出席登録APIを呼び出せる。
function getMemberAttendanceState(params, ctx) {
  ctx = ensureSheetContext(ctx);

  const memberId = normalizeId_(params.member_id);
  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);
  const attendanceDate = parseAttendanceDate_(params.attendance_date, ctx);

  if (!memberId || !locationId || !billingBlockId) {
    return { ok: false, message: "会員・道場・課金枠を指定してください。" };
  }
  const member = getMembers(ctx).find(row =>
    normalizeId_(row["member_id"]) === memberId && isActiveMasterRow_(row)
  );
  if (!member) return { ok: false, message: "有効な会員が見つかりません。" };

  validateAttendanceScope_(locationId, billingBlockId, ctx);
  const rows = getActiveAttendanceRowsForScope(
    attendanceDate, memberId, locationId, billingBlockId, ctx
  );
  const progress = attendanceProgress_getMemberSummary(memberId, ctx);
  const billingSelection = attendance_getBillingSelectionState_(member, ctx);

  return {
    ok: true,
    member_id: memberId,
    member_name: progress.ok ? progress.member_name : String(member["氏名"] || ""),
    current_rank: progress.ok ? progress.current_rank : "",
    rank_sort_order: progress.ok ? progress.rank_sort_order : 999999,
    next_rank: progress.ok ? progress.next_rank : "",
    rank_source: progress.ok ? progress.rank_source : "",
    training_count: progress.ok ? progress.training_count : 0,
    required_training_count: progress.ok ? progress.required_training_count : 0,
    required_training_count_source: progress.ok ? progress.required_training_count_source : "未設定",
    remaining_training_count: progress.ok ? progress.remaining_training_count : null,
    examination_ready: progress.ok ? progress.examination_ready : false,
    recent_attendance_dates: progress.ok ? progress.recent_attendance_dates : [],
    selected_slot_ids: Array.from(new Set(rows.map(row => normalizeId_(row["slot_id"])).filter(Boolean))),
    billing_plan_id: billingSelection.plan_id,
    billing_plan_name: billingSelection.plan_name,
    billing_plan_selected: billingSelection.selected,
    billing_plan_candidates: billingSelection.candidates
  };
}

// 出席受付で使う対象月の料金プラン状態。
// 04_月次選択があればそれを正とし、未選択時だけ会員区分から候補を返す。
function attendance_getBillingSelectionState_(member, ctx) {
  ctx = ensureSheetContext(ctx);
  const memberId = normalizeId_(member["member_id"]);
  const billingGroupId = normalizeId_(member["請求グループID"]);
  const targetMonth = sup_targetMonth(ctx);
  const existing = billingGroupId
    ? billingCoreGetMonthlySelection_(billingGroupId, targetMonth, ctx)
    : null;
  const fees = getFees(ctx).filter(isActiveMasterRow_);

  function feeDto_(planId) {
    const fee = fees.find(function(row) {
      return normalizeId_(row["plan_id"]) === normalizeId_(planId);
    });
    return {
      plan_id: normalizeId_(planId),
      plan_name: fee ? String(fee["表示名"] || planId).trim() : normalizeId_(planId),
      fee_type: fee ? String(fee["会費タイプ"] || "").trim() : "",
      amount: fee ? Number(fee["回数単価"] || 0) : 0,
      cap_amount: fee ? Number(fee["上限金額"] || 0) : 0
    };
  }

  if (existing) {
    const planId = normalizeId_(existing["plan_id"]);
    const dto = feeDto_(planId);
    return {
      member_id: memberId,
      target_month: targetMonth,
      selected: true,
      plan_id: planId,
      plan_name: dto.plan_name,
      candidates: [dto]
    };
  }

  const memberType = String(member["区分"] || "").trim();
  const planIds = getPlanSelectionRules(ctx)
    .filter(function(row) {
      return String(row["member_type"] || "").trim() === memberType;
    })
    .map(function(row) { return normalizeId_(row["selectable_plan_id"]); })
    .filter(Boolean);

  return {
    member_id: memberId,
    target_month: targetMonth,
    selected: false,
    plan_id: "",
    plan_name: "",
    candidates: Array.from(new Set(planIds)).map(feeDto_)
  };
}

// 保存直後の一致確認専用Query。
// 審査進捗等を再集計せず、出席枠と会員マスタ上の現在級段だけを返す。
function getAttendanceSavedState(params, ctx) {
  ctx = ensureSheetContext(ctx);
  const memberId = normalizeId_(params.member_id);
  const locationId = normalizeId_(params.location_id);
  const billingBlockId = normalizeId_(params.billing_block_id);
  const attendanceDate = parseAttendanceDate_(params.attendance_date, ctx);
  if (!memberId || !locationId || !billingBlockId) {
    return { ok: false, message: "会員・道場・課金枠を指定してください。" };
  }
  const member = getMembers(ctx).find(function(row) {
    return normalizeId_(row["member_id"]) === memberId && isActiveMasterRow_(row);
  });
  if (!member) return { ok: false, message: "有効な会員が見つかりません。" };
  const rows = getActiveAttendanceRowsForScope(
    attendanceDate, memberId, locationId, billingBlockId, ctx
  );
  return {
    ok: true,
    member_id: memberId,
    current_rank: String(member["現在級段位"] || "").trim(),
    selected_slot_ids: Array.from(new Set(rows.map(function(row) {
      return normalizeId_(row["slot_id"]);
    }).filter(Boolean)))
  };
}

//------------------------------------------------------------------------------------------------
// doPost() で呼び出すと、JSONP形式で出席登録APIを呼び出せる。
function registerAttendanceBatch(data, ctx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ctx = ensureSheetContext(ctx || createSheetContext());
    return registerAttendanceBatchLocked_(data || {}, ctx);

  } finally {
    lock.releaseLock();
  }
}


function registerAttendanceBatchLocked_(data, ctx) {
  ctx = ensureSheetContext(ctx);

  const teacherId = normalizeId_(data.teacher_id);
  const locationId = normalizeId_(data.location_id);
  const billingBlockId = normalizeId_(data.billing_block_id);

  // 04_月次選択の正規確定点を出席登録へ置く。
  // 既存の同一planは billingMonthlyAccept() が冪等にSKIPする。
  // slot_ids が空の項目は出席取消・同期解除なので、新しい月次選択は作らない。
  const billingResults = [];
  const attendanceItems = Array.isArray(data.attendance_items) ? data.attendance_items : [];
  for (let i = 0; i < attendanceItems.length; i++) {
    const item = attendanceItems[i] || {};
    const slotIds = Array.isArray(item.slot_ids) ? item.slot_ids.filter(Boolean) : [];
    if (slotIds.length === 0) continue;

    const memberId = normalizeId_(item.member_id);
    const member = getMembers(ctx).find(function(row) {
      return normalizeId_(row["member_id"]) === memberId && isActiveMasterRow_(row);
    });
    if (!member) return { ok: false, message: "有効な会員が見つかりません: " + memberId };

    const state = attendance_getBillingSelectionState_(member, ctx);
    const planId = state.selected ? state.plan_id : normalizeId_(item.plan_id);
    if (!planId) {
      return {
        ok: false,
        message: memberId + " の今月の会費タイプ（月額／都度）を選択してください。"
      };
    }

    // この後で出席確定 → 都度請求同期 → 最終View refreshまで行うため、
    // 月次選択時点の中間View refreshは遅延する。
    const billingResult = billingMonthlyAccept(
      memberId,
      planId,
      ctx,
      { deferViewRefresh: true }
    );
    if (!billingResult || billingResult.ok !== true) {
      return {
        ok: false,
        message: memberId + " の会費タイプを登録できませんでした: " +
          ((billingResult && billingResult.message) || "不明なエラー")
      };
    }
    billingResults.push({
      member_id: memberId,
      plan_id: planId,
      skipped: billingResult.skipped === true,
      idempotent: billingResult.idempotent === true
    });
  }

  // Step 3-C: keep the existing reception/billing flow, but route only the
  // Attendance Core write/read portion through the Portable DAO.
  const result = dojoAttendanceStep3RegisterCore({
    teacher_id: teacherId,
    location_id: locationId,
    billing_block_id: billingBlockId,
    attendance_date: data.attendance_date,
    attendance_session_id: data.attendance_session_id,
    attendance_items: data.attendance_items,
    source: data.source || ATTENDANCE_SOURCE_QR,
    require_teacher: true,
    initial_status: "有効",
    sync_unselected: true,
    allow_duplicate_members: false,
    remarks: "",
    cancel_reason: "出席確認画面との同期による選択解除",
    message: ""
  }, ctx);

  if (result && result.ok) {
    result.billing_selections = billingResults;

    // 出席登録後の確定した07を根拠に、回数料金の累積請求を同期する。
    // 04が既存P002でSKIPされても、都度課金はここで継続する。
    result.usage_billing = [];
    const syncedMembers = {};
    attendanceItems.forEach(function(item) {
      const memberId = normalizeId_(item && item.member_id);
      const slotIds = Array.isArray(item && item.slot_ids) ? item.slot_ids.filter(Boolean) : [];
      if (!memberId || slotIds.length === 0 || syncedMembers[memberId]) return;
      syncedMembers[memberId] = true;
      result.usage_billing.push(
        billingUsageSyncFromAttendance_(memberId, sup_targetMonth(ctx), ctx)
      );
    });

    const usageFailed = result.usage_billing.find(function(item) {
      return item && item.ok === false;
    });
    if (usageFailed) {
      return {
        ok: false,
        message: "出席は登録されましたが、都度請求の同期に失敗しました: " + usageFailed.message,
        attendance_result: result
      };
    }

    result.rank_updates = attendanceProgress_updateSelfDeclaredRanks_(data.attendance_items, ctx);
    result.post_event = attendance_postEvent(result, data, ctx);
  }
  return result;
}

/**
 * 出席登録のPostEvent入口。
 *
 * 私書箱方式のイベント原簿・購読・配送はTASK-FWK-020で実装保留中のため、
 * 現在は外部書込みや会費処理を行わず、入口を通過した事実だけを返す。
 */
function attendance_postEvent(result, data, ctx) {
  return {
    ok: true,
    posted: false,
    deferred: true,
    event_type: "ATTENDANCE_CHANGED",
    source: "ATTENDANCE",
    correlation_id: normalizeId_(data && data.attendance_session_id),
    message: "私書箱方式のイベント配送は実装保留中です。"
  };
}

function attendanceProgress_updateSelfDeclaredRanks_(items, ctx) {
  return attendanceProgress_updateSelfDeclaredRanks(items, ctx);
}

function validateAttendanceMasterData_(teacherId, locationId, billingBlockId, ctx) {
  ctx = ensureSheetContext(ctx);
  
  const teacher = getTeachers(ctx).find(row =>
    normalizeId_(row["teacher_id"]) === teacherId && isActiveMasterRow_(row)
  );
  if (!teacher) throw new Error("有効な先生が見つかりません。");
  if (!isTrueValue_(teacher["出席受付可"])) throw new Error("この先生は出席受付不可です。");

  validateAttendanceScope_(locationId, billingBlockId, ctx);
}

function validateAttendanceScope_(locationId, billingBlockId, ctx) {
  ctx = ensureSheetContext(ctx);

  const location = getLocations(ctx).find(row =>
    normalizeId_(row["location_id"]) === locationId && isActiveMasterRow_(row)
  );
  if (!location) throw new Error("有効な道場が見つかりません。");

  const block = getBillingBlocks(ctx).find(row =>
    normalizeId_(row["billing_block_id"]) === billingBlockId && isActiveMasterRow_(row)
  );
  if (!block || normalizeId_(block["location_id"]) !== locationId) {
    throw new Error("道場と課金枠の組み合わせが不正です。");
  }
}

function calculateAttendanceChargeCount(memberId, targetMonth, ctx) {
  ctx = ensureSheetContext(ctx);
  const facts = daoAttendanceCollectChargeRows_(ctx);
  return attendanceCore_calculateChargeCountFromRows_(
    memberId,
    targetMonth,
    facts.attendances,
    facts.billingBlocks,
    ctx
  );
}

// Sheetに依存しない課金回数計算Core。月次高速Runnerも同じ計算を利用する。
function attendanceCore_calculateChargeCountFromRows_(memberId, targetMonth, attendances, billingBlocks, ctx) {

  const target = normalizeMonth(targetMonth);
  const blockMap = {};
  (billingBlocks || []).forEach(block => {
    if (isActiveMasterRow_(block)) blockMap[normalizeId_(block["billing_block_id"])] = block;
  });

  const groups = {};
  (attendances || []).forEach(row => {
    if (!isActiveMasterRow_(row)) return;
    if (normalizeMonth(row["target_month"]) !== target) return;
    if (normalizeId_(row["member_id"]) !== normalizeId_(memberId)) return;

    const dateText = formatAttendanceDate_(row["稽古日"], ctx);
    const blockId = normalizeId_(row["billing_block_id"]);
    const slotId = normalizeId_(row["slot_id"]);
    if (!dateText || !blockId || !slotId) return;

    const key = dateText + "|" + blockId;
    if (!groups[key]) groups[key] = {};
    groups[key][slotId] = true;
  });

  let chargeCount = 0;
  const details = [];
  Object.keys(groups).forEach(key => {
    const blockId = key.split("|")[1];
    const slotCount = Object.keys(groups[key]).length;
    const slotsPerCharge = Math.max(1, Number((blockMap[blockId] || {})["1課金あたり枠数"] || 2));
    const count = Math.ceil(slotCount / slotsPerCharge);
    chargeCount += count;
    details.push({ key, slot_count: slotCount, slots_per_charge: slotsPerCharge, charge_count: count });
  });

  return { charge_count: chargeCount, details };
}

function normalizeId_(value) {
  return String(value == null ? "" : value).trim();
}

function isActiveMasterRow_(row) {
  const status = normalizeId_(row["状態"]);
  return status === "" || status === "有効" || status === "在籍" || status === "TRUE";
}

function isTrueValue_(value) {
  return value === true || ["TRUE", "true", "1", "可", "有効"].includes(normalizeId_(value));
}

function parseAttendanceDate_(value, ctx) {
  ctx = ensureSheetContext(ctx);

  if (!value) return sup_now(ctx);
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("稽古日は yyyy-MM-dd 形式で指定してください。");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) throw new Error("稽古日が不正です。");
  return date;
}

function formatAttendanceDate_(value, ctx) {
  ctx = ensureSheetContext(ctx);

  if (value === "" || value == null) return "";
  const date = value instanceof Date ? value : parseAttendanceDate_(value, ctx);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function formatTimeValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }
  return String(value == null ? "" : value).trim();
}

function timeToMinutes_(value) {
  const text = formatTimeValue_(value);
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTimeText_(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function parseSessionDateTime_(value, ctx) {
  if (!value) return sup_now(ctx);
  const date = new Date(value);
  if (isNaN(date.getTime())) throw new Error("課金枠判定日時が不正です。");
  return date;
}

function getWeekdayLabel_(date) {
  const dayNumber = Number(Utilities.formatDate(
    date, Session.getScriptTimeZone(), "u"
  ));
  return ["", "月", "火", "水", "木", "金", "土", "日"][dayNumber] || "";
}

function weekdayMatches_(masterValue, weekdayLabel) {
  const value = normalizeId_(masterValue).replace(/曜日/g, "");
  return value === weekdayLabel || value.indexOf(weekdayLabel) >= 0;
}

function makeAttendanceKey_(dateText, memberId, slotId) {
  return [dateText, normalizeId_(memberId), normalizeId_(slotId)].join("|");
}

// ========================================
// 04_AttendanceCore.js
// 出席共通Core
// ========================================
//
// TYPE: CORE
// AREA: ATTENDANCE
// TAG: ATTENDANCE
// TAG: CORE
// TAG: RDD
//
// require_teacher:
// true  = 先生操作として teacher_id を必須にする
// false = 会員セルフ操作として teacher_id を空許容する
// LEGACY COMPAT:
// 旧関数名互換のために残す。
// 新規実装では attendanceCore_findRowsForScope_ を使用する。

function attendanceCore_registerBatch_(options, ctx) {
  ctx = ensureSheetContext(ctx);

  options = options || {};

  const teacherId = normalizeId_(options.teacher_id);
  const locationId = normalizeId_(options.location_id);
  const billingBlockId = normalizeId_(options.billing_block_id);
  const sessionId = normalizeId_(options.attendance_session_id) || ("ASES-" + Utilities.getUuid());
  const attendanceDate = options.attendance_date || sup_today(ctx);
  const targetMonth = options.target_month || sup_targetMonth(ctx);
  const items = Array.isArray(options.attendance_items) ? options.attendance_items : [];

  const requireTeacher = options.require_teacher === true;
  const initialStatus = String(options.initial_status || "有効");
  const source = String(options.source || "attendance_core");
  const remarks = String(options.remarks || "");
  const syncUnselected = options.sync_unselected === true;
  const allowDuplicateMembers = options.allow_duplicate_members === true;

  if (requireTeacher) {
    if (!teacherId || !locationId || !billingBlockId) {
      return { ok: false, message: "先生・道場・課金枠を指定してください。" };
    }
    validateAttendanceMasterData_(teacherId, locationId, billingBlockId, ctx);
  } else {
    if (!locationId || !billingBlockId) {
      return { ok: false, message: "道場・課金枠を指定してください。" };
    }
    validateAttendanceScope_(locationId, billingBlockId, ctx);
  }

  if (items.length === 0) {
    return { ok: false, message: "出席対象がありません。" };
  }

  const members = attendanceCore_getMemberMap_(ctx);
  const slots = attendanceCore_getSlotMap_(locationId, billingBlockId, ctx);

  const rowsToAppend = [];
  const rowsToCancel = [];
  const results = [];
  const requestedMembers = {};

  items.forEach(function(item) {
    const memberId = normalizeId_(item.member_id);
    const hasSlotArray = Array.isArray(item.slot_ids);
    const slotIds = hasSlotArray
      ? Array.from(new Set(item.slot_ids.map(normalizeId_).filter(Boolean)))
      : [];

    const result = {
      member_id: memberId,
      registered_slot_ids: [],
      retained_slot_ids: [],
      cancelled_slot_ids: [],
      errors: []
    };

    if (!memberId || !members[memberId]) {
      result.errors.push("有効な会員が見つかりません。");
      results.push(result);
      return;
    }

    if (!allowDuplicateMembers && requestedMembers[memberId]) {
      result.errors.push("同じ会員が送信データ内で重複しています。");
      results.push(result);
      return;
    }
    requestedMembers[memberId] = true;

    if (!hasSlotArray) {
      result.errors.push("slot_ids は配列で指定してください。");
      results.push(result);
      return;
    }

    // 同期画面の全解除は、同じ会員・日付・道場・課金枠の既存出席を取消す。
    // 新規登録専用の入口では、従来どおり空の選択を拒否する。
    if (slotIds.length === 0 && !syncUnselected) {
      result.errors.push("slot_ids が指定されていません。");
      results.push(result);
      return;
    }

    slotIds.forEach(function(slotId) {
      if (!slots[slotId]) {
        result.errors.push("無効な稽古枠: " + slotId);
      }
    });

    if (result.errors.length > 0) {
      results.push(result);
      return;
    }

    const existingRows = attendanceCore_findRowsForScope_({
      attendance_date: attendanceDate,
      member_id: memberId,
      location_id: locationId,
      billing_block_id: billingBlockId
    }, ctx);

    const existingBySlot = {};
    existingRows.forEach(function(row) {
      existingBySlot[normalizeId_(row["slot_id"])] = row;
    });

    if (syncUnselected) {
      existingRows.forEach(function(row) {
        const existingSlotId = normalizeId_(row["slot_id"]);
        if (slotIds.indexOf(existingSlotId) < 0) {
          rowsToCancel.push(row);
          result.cancelled_slot_ids.push(existingSlotId);
        }
      });
    }

    slotIds.forEach(function(slotId) {
      if (existingBySlot[slotId]) {
        result.retained_slot_ids.push(slotId);
        return;
      }

      const slot = slots[slotId];

      rowsToAppend.push({
        attendance_id: "ATT-" + Utilities.getUuid(),
        "稽古日": attendanceDate,
        "登録日時": sup_now(ctx),
        member_id: memberId,
        target_month: targetMonth,
        location_id: locationId,
        slot_id: slotId,
        billing_block_id: billingBlockId,
        teacher_id: teacherId,
        attendance_session_id: sessionId,
        "稽古時間分": Number(slot["稽古時間分"] || 60),
        "状態": initialStatus,
        source: source,
        "取消日時": "",
        "取消者teacher_id": "",
        "取消理由": "",
        "備考": remarks
      });

      result.registered_slot_ids.push(slotId);
    });

    results.push(result);
  });

  if (rowsToCancel.length > 0) {
    cancelAttendanceRows(
      rowsToCancel,
      teacherId,
      options.cancel_reason || "出席確認画面との同期による選択解除",
      ctx
    );
  }

  appendAttendanceRows(rowsToAppend, ctx);

  // 07へ保存した同じ出席事実を、その場で20 Read Modelへ投影する。
  // 取消対象も同時に渡し、View側の明細から除外する。
  paymentStatusView_projectAttendances_(rowsToAppend, rowsToCancel, ctx);

  return {
    ok: true,
    attendance_session_id: sessionId,
    registered_count: rowsToAppend.length,
    retained_count: results.reduce(function(sum, result) {
      return sum + result.retained_slot_ids.length;
    }, 0),
    cancelled_count: rowsToCancel.length,
    results: results,
    message: String(options.message || "出席登録を処理しました。")
  };
}

function attendanceCore_getMemberMap_(ctx) {
  return daoAttendanceGetMemberMap_(ctx);
}

function attendanceCore_getSlotMap_(locationId, billingBlockId, ctx) {
  return daoAttendanceGetSlotMap_(locationId, billingBlockId, ctx);
}

function attendanceCore_findRowsForScope_(params, ctx) {
  return daoAttendanceFindRowsForScope_(params, ctx);
}

function attendanceCore_updateRows_(rows, updateValues, ctx) {
  return daoAttendanceUpdateRows_(rows, updateValues, ctx);
}

// 互換用。既存名を使っている箇所のために残す。
function attendanceFindRowsForScope_(params, ctx) {
  return attendanceCore_findRowsForScope_(params, ctx);
}

function attendanceUpdateRows_(rows, updateValues, ctx) {
  return attendanceCore_updateRows_(rows, updateValues, ctx);
}

// 出席課金集計が必要とする原簿を取得する。計算・状態判定はBusinessが所有する。
// 行順と読み取り順を維持し、DAOでの事前絞込みは行わない。
function daoAttendanceCollectChargeRows_(ctx) {
  const core = daoCore_(ctx);
  const attendances = core.read('attendances', ctx);
  const billingBlocks = core.read('billingBlocks', ctx);
  return { attendances: attendances, billingBlocks: billingBlocks };
}

function daoAttendanceAppend_(attendanceRows, ctx) {
  return daoCore_(ctx).appendAttendanceRows(attendanceRows, ctx);
}

function daoAttendanceCancel_(attendanceRows, teacherId, reason, ctx) {
  return daoCore_(ctx).cancelAttendanceRows(attendanceRows, teacherId, reason, ctx);
}

function daoAttendanceGetMemberMap_(ctx) {
  ctx = daoContext_(ctx);

  const members = {};
  daoCore_(ctx).read('members', ctx).forEach(function(row) {
    if (isActiveMasterRow_(row)) {
      members[normalizeId_(row["member_id"])] = row;
    }
  });
  return members;
}

function daoAttendanceGetSlotMap_(locationId, billingBlockId, ctx) {
  ctx = daoContext_(ctx);

  const slots = {};
  daoCore_(ctx).read('trainingSlots', ctx).forEach(function(row) {
    const slotId = normalizeId_(row["slot_id"]);

    if (
      slotId &&
      isActiveMasterRow_(row) &&
      normalizeId_(row["location_id"]) === normalizeId_(locationId) &&
      normalizeId_(row["billing_block_id"]) === normalizeId_(billingBlockId)
    ) {
      slots[slotId] = row;
    }
  });
  return slots;
}

function daoAttendanceFindRowsForScope_(params, ctx) {
  ctx = daoContext_(ctx);

  const rows = daoCore_(ctx).readAttendanceScopeRows(ctx);
  const attendanceDate = parseAttendanceDate_(params.attendance_date, ctx);
  const dateText = formatAttendanceDate_(attendanceDate, ctx);

  return rows.filter(function(row) {
    if (formatAttendanceDate_(row["稽古日"], ctx) !== dateText) return false;

    if (params.member_id &&
        normalizeId_(row["member_id"]) !== normalizeId_(params.member_id)) return false;

    if (params.location_id &&
        normalizeId_(row["location_id"]) !== normalizeId_(params.location_id)) return false;

    if (params.billing_block_id &&
        normalizeId_(row["billing_block_id"]) !== normalizeId_(params.billing_block_id)) return false;

    if (params.status &&
        normalizeId_(row["状態"]) !== normalizeId_(params.status)) return false;

    return normalizeId_(row["状態"]) !== "取消";
  });
}


function daoAttendanceUpdateRows_(rows, updateValues, ctx) {
  return daoCore_(ctx).updateAttendanceRows(rows, updateValues, ctx);
}

return attendanceCore_registerBatch_;
};
}};const cache={};function require(n){if(!Object.hasOwn(modules,n))throw new Error("Unknown module "+n);if(!cache[n]){const m={exports:{}};cache[n]=m;modules[n](m,m.exports,require);}return cache[n].exports;}return require("./ApplicationStep3.js");})();
