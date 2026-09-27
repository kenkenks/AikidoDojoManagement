const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {tableDefinitions}=require('../shared/DAO_Definitions.js');
const adapterSource=fs.readFileSync(path.join(__dirname,'../adapters/gas/DAO_Core.js'),'utf8');
function loadGasCore(){
  const module={exports:{}};
  const sandbox={module,exports:module.exports,console,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},SpreadsheetApp:{getActiveSpreadsheet(){throw new Error('spreadsheet dependency required');}},require:id=>{if(id==='./DAO_Definitions.js') return {tableDefinitions}; throw new Error('unexpected require '+id);}};
  vm.runInNewContext(adapterSource,sandbox,{filename:'DAO_Core.js'});
  return module.exports.createCore;
}
const createCore=loadGasCore();
const {createDao}=require('../shared/DAO_Business.js');
const {collectAttendanceFacts}=require('../shared/AttendanceNative.js');

function sheet(headers, objects){
  const rows=[headers.slice(),...objects.map(obj=>headers.map(h=>obj[h]??''))];
  return {getDataRange:()=>({getValues:()=>rows.map(row=>row.slice())})};
}
function portable(){
  const sheets={
    '01_会員マスタ':sheet(['member_id','状態'],[{member_id:'M1','状態':'有効'}]),
    '11_先生マスタ':sheet(['teacher_id','状態','出席受付可'],[{teacher_id:'T1','状態':'有効','出席受付可':'TRUE'}]),
    '10_道場マスタ':sheet(['location_id','状態'],[{location_id:'L1','状態':'有効'}]),
    '13_課金枠マスタ':sheet(['billing_block_id','location_id','状態'],[{billing_block_id:'B1',location_id:'L1','状態':'有効'}]),
    '12_稽古枠マスタ':sheet(['slot_id','location_id','billing_block_id','稽古時間分','状態'],[{slot_id:'S1',location_id:'L1',billing_block_id:'B1','稽古時間分':60,'状態':'有効'}]),
    '07_出席ログ':sheet(['attendance_id','稽古日','登録日時','member_id','target_month','location_id','slot_id','billing_block_id','teacher_id','attendance_session_id','稽古時間分','状態','source','取消日時','取消者teacher_id','取消理由','備考'],[{attendance_id:'A1','稽古日':'2099-07-09','登録日時':'2099-07-09T10:00:00+09:00',member_id:'M1',target_month:'2099-07',location_id:'L1',slot_id:'S1',billing_block_id:'B1',teacher_id:'T1',attendance_session_id:'SESSION','稽古時間分':60,'状態':'有効',source:'test','取消日時':'','取消者teacher_id':'','取消理由':'','備考':''}])
  };
  const spreadsheet={getSheetByName:name=>sheets[name]||null};
  return createDao(createCore({}, {spreadsheet}),'gas');
}

test('native collect reads attendance facts through Portable GAS DAO',()=>{
  const facts=collectAttendanceFacts(portable());
  assert.deepEqual(facts.members,[{member_id:'M1','状態':'有効'}]);
  assert.deepEqual(facts.teachers,[{teacher_id:'T1','状態':'有効','出席受付可':'TRUE'}]);
  assert.deepEqual(facts.locations,[{location_id:'L1','状態':'有効'}]);
  assert.deepEqual(facts.billingBlocks,[{billing_block_id:'B1',location_id:'L1','状態':'有効'}]);
  assert.deepEqual(facts.trainingSlots,[{slot_id:'S1',location_id:'L1',billing_block_id:'B1','稽古時間分':60,'状態':'有効'}]);
  assert.equal(facts.attendances.length,1);
  assert.equal(facts.attendances[0].attendance_id,'A1');
});

test('native collect requires Portable DAO read contract',()=>{
  assert.throws(()=>collectAttendanceFacts({}),/ATTENDANCE_DAO_REQUIRED/);
});
