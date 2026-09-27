/* Generated Native GAS Attendance artifact. */
var DojoAttendanceNative=(function(){const modules={"./DAO_Definitions.js":function(module,exports,require){
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
"./AttendanceNative.js":function(module,exports,require){
'use strict';

// Native Attendance decision logic.
// This module has no storage side effects. It receives already-collected facts
// and returns the attendance changes that record/post phases may apply later.
function makeAttendancePlan(options = {}, facts = {}, dependencies = {}) {
  const normalizeId = value => String(value == null ? '' : value).trim();
  const isActive = row => {
    const status = normalizeId((row || {})['状態']);
    return status === '' || status === '有効' || status === '在籍' || status === 'TRUE';
  };
  const isTrue = value => value === true || ['TRUE', 'true', '1', '可', '有効'].includes(normalizeId(value));
  const dateKey = dependencies.dateKey || (value => {
    if(value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value == null ? '' : value).trim().slice(0, 10);
  });
  const uuid = dependencies.uuid;
  const now = dependencies.now;
  if(typeof uuid !== 'function') throw new Error('UUID_PROVIDER_REQUIRED');
  if(typeof now !== 'function') throw new Error('NOW_PROVIDER_REQUIRED');

  const teacherId = normalizeId(options.teacher_id);
  const locationId = normalizeId(options.location_id);
  const billingBlockId = normalizeId(options.billing_block_id);
  const sessionId = normalizeId(options.attendance_session_id) || ('ASES-' + uuid());
  const attendanceDate = options.attendance_date;
  const targetMonth = options.target_month;
  const items = Array.isArray(options.attendance_items) ? options.attendance_items : [];
  const requireTeacher = options.require_teacher === true;
  const initialStatus = String(options.initial_status || '有効');
  const source = String(options.source || 'attendance_core');
  const remarks = String(options.remarks || '');
  const syncUnselected = options.sync_unselected === true;
  const allowDuplicateMembers = options.allow_duplicate_members === true;

  const members = (facts.members || []).filter(isActive);
  const teachers = facts.teachers || [];
  const locations = facts.locations || [];
  const billingBlocks = facts.billingBlocks || [];
  const trainingSlots = facts.trainingSlots || [];
  const attendances = facts.attendances || [];

  if(requireTeacher) {
    if(!teacherId || !locationId || !billingBlockId)
      return {result:{ok:false,message:'先生・道場・課金枠を指定してください。'}, rowsToAppend:[], rowsToCancel:[]};
    const teacher = teachers.find(row => normalizeId(row.teacher_id) === teacherId && isActive(row));
    if(!teacher) throw new Error('有効な先生が見つかりません。');
    if(!isTrue(teacher['出席受付可'])) throw new Error('この先生は出席受付不可です。');
  } else if(!locationId || !billingBlockId) {
    return {result:{ok:false,message:'道場・課金枠を指定してください。'}, rowsToAppend:[], rowsToCancel:[]};
  }

  const location = locations.find(row => normalizeId(row.location_id) === locationId && isActive(row));
  if(!location) throw new Error('有効な道場が見つかりません。');
  const block = billingBlocks.find(row => normalizeId(row.billing_block_id) === billingBlockId && isActive(row));
  if(!block || normalizeId(block.location_id) !== locationId)
    throw new Error('道場と課金枠の組み合わせが不正です。');

  if(items.length === 0)
    return {result:{ok:false,message:'出席対象がありません。'}, rowsToAppend:[], rowsToCancel:[]};

  const memberMap = Object.fromEntries(members.map(row => [normalizeId(row.member_id), row]));
  const slotMap = {};
  trainingSlots.forEach(row => {
    const slotId = normalizeId(row.slot_id);
    if(slotId && isActive(row) && normalizeId(row.location_id) === locationId && normalizeId(row.billing_block_id) === billingBlockId)
      slotMap[slotId] = row;
  });

  const rowsToAppend = [];
  const rowsToCancel = [];
  const results = [];
  const requestedMembers = {};

  items.forEach(item => {
    const memberId = normalizeId(item.member_id);
    const hasSlotArray = Array.isArray(item.slot_ids);
    const slotIds = hasSlotArray ? Array.from(new Set(item.slot_ids.map(normalizeId).filter(Boolean))) : [];
    const result = {member_id:memberId,registered_slot_ids:[],retained_slot_ids:[],cancelled_slot_ids:[],errors:[]};

    if(!memberId || !memberMap[memberId]) result.errors.push('有効な会員が見つかりません。');
    else if(!allowDuplicateMembers && requestedMembers[memberId]) result.errors.push('同じ会員が送信データ内で重複しています。');
    else {
      requestedMembers[memberId] = true;
      if(!hasSlotArray) result.errors.push('slot_ids は配列で指定してください。');
      else if(slotIds.length === 0 && !syncUnselected) result.errors.push('slot_ids が指定されていません。');
      else slotIds.forEach(slotId => { if(!slotMap[slotId]) result.errors.push('無効な稽古枠: ' + slotId); });
    }
    if(result.errors.length) { results.push(result); return; }

    const existingRows = attendances.filter(row =>
      normalizeId(row['状態']) !== '取消' &&
      dateKey(row['稽古日']) === dateKey(attendanceDate) &&
      normalizeId(row.member_id) === memberId &&
      normalizeId(row.location_id) === locationId &&
      normalizeId(row.billing_block_id) === billingBlockId
    );
    const existingBySlot = Object.fromEntries(existingRows.map(row => [normalizeId(row.slot_id), row]));

    if(syncUnselected) existingRows.forEach(row => {
      const slotId = normalizeId(row.slot_id);
      if(!slotIds.includes(slotId)) { rowsToCancel.push(row); result.cancelled_slot_ids.push(slotId); }
    });

    slotIds.forEach(slotId => {
      if(existingBySlot[slotId]) { result.retained_slot_ids.push(slotId); return; }
      const slot = slotMap[slotId];
      rowsToAppend.push({
        attendance_id:'ATT-' + uuid(), '稽古日':attendanceDate, '登録日時':now(), member_id:memberId,
        target_month:targetMonth, location_id:locationId, slot_id:slotId, billing_block_id:billingBlockId,
        teacher_id:teacherId, attendance_session_id:sessionId, '稽古時間分':Number(slot['稽古時間分'] || 60),
        '状態':initialStatus, source, '取消日時':'', '取消者teacher_id':'', '取消理由':'', '備考':remarks
      });
      result.registered_slot_ids.push(slotId);
    });
    results.push(result);
  });

  return {
    result:{
      ok:true, attendance_session_id:sessionId, registered_count:rowsToAppend.length,
      retained_count:results.reduce((sum,result)=>sum+result.retained_slot_ids.length,0),
      cancelled_count:rowsToCancel.length, results,
      message:String(options.message || '出席登録を処理しました。')
    },
    rowsToAppend,
    rowsToCancel
  };
}

// Native Attendance collect phase. All persistence reads go through the
// Portable DAO contract; the returned facts are storage-neutral inputs for make.
function collectAttendanceFacts(dao) {
  if(!dao || typeof dao.readAll !== 'function') throw new Error('ATTENDANCE_DAO_REQUIRED');
  return {
    members: dao.readAll('members'),
    teachers: dao.readAll('teachers'),
    locations: dao.readAll('locations'),
    billingBlocks: dao.readAll('billingBlocks'),
    trainingSlots: dao.readAll('trainingSlots'),
    attendances: dao.readAll('attendance')
  };
}

// Native Attendance record phase. This function does not know Sheets or Firestore;
// it only applies a completed AttendancePlan through the Portable DAO contract.
function recordAttendancePlan(plan = {}, options = {}, dao, dependencies = {}) {
  if(!dao || typeof dao.appendRecord !== 'function' || typeof dao.updateByKey !== 'function')
    throw new Error('ATTENDANCE_DAO_REQUIRED');
  if(!plan.result || plan.result.ok !== true) return plan.result;

  const now = dependencies.now;
  if(typeof now !== 'function') throw new Error('NOW_PROVIDER_REQUIRED');
  const teacherId = String(options.teacher_id == null ? '' : options.teacher_id).trim();
  const cancelReason = String(options.cancel_reason || '出席枠再選択');
  const cancelledAt = now();

  for(const row of plan.rowsToCancel || []) {
    const attendanceId = String((row || {}).attendance_id == null ? '' : row.attendance_id).trim();
    if(!attendanceId) throw new Error('ATTENDANCE_ID_REQUIRED');
    const updated = dao.updateByKey('attendance', attendanceId, {
      '状態':'取消', '取消日時':cancelledAt, '取消者teacher_id':teacherId, '取消理由':cancelReason
    });
    if(updated && updated.found === false) throw new Error('ATTENDANCE_NOT_FOUND: ' + attendanceId);
  }
  for(const row of plan.rowsToAppend || []) dao.appendRecord('attendance', row);
  return plan.result;
}

// Native Attendance post phase. Projection is an external reflection of an
// already-decided/recorded attendance change, so the domain logic only depends
// on a projection contract and does not know PaymentStatusView or GAS.
function postAttendancePlan(plan = {}, dependencies = {}) {
  if(!plan.result || plan.result.ok !== true) return plan.result;
  const projectAttendances = dependencies.projectAttendances;
  if(typeof projectAttendances !== 'function') throw new Error('ATTENDANCE_PROJECTION_REQUIRED');
  projectAttendances({
    appended: plan.rowsToAppend || [],
    cancelled: plan.rowsToCancel || []
  });
  return plan.result;
}

module.exports={collectAttendanceFacts,makeAttendancePlan,recordAttendancePlan,postAttendancePlan};

},
"./ApplicationAttendanceNative.js":function(module,exports,require){
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
    attendance.recordAttendancePlan(plan,options,dao,{now:dependencies.now});
    return attendance.postAttendancePlan(plan,{projectAttendances:dependencies.projectAttendances});
  }

  return {registerAttendanceCore};
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

}};const cache={};function require(n){if(!Object.hasOwn(modules,n))throw new Error("Unknown module "+n);if(!cache[n]){const m={exports:{}};cache[n]=m;modules[n](m,m.exports,require);}return cache[n].exports;}return require("./ApplicationAttendanceNative.js");})();
