const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makeAttendancePlan}=require('../shared/AttendanceNative.js');

const root=path.resolve(__dirname,'..');
const legacySource=['gas/04_Attendance.js','gas/04_AttendanceCore.js','gas/DAO_Business_Attendance.js']
  .map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
const dependencyNames=['ensureSheetContext','Utilities','Session','sup_now','sup_today','sup_targetMonth','getMembers','getTeachers','getLocations','getBillingBlocks','getTrainingSlots','daoContext_','daoCore_','cancelAttendanceRows','appendAttendanceRows','paymentStatusView_projectAttendances_'];
const createLegacyCore=new Function(...dependencyNames,legacySource+'\nreturn attendanceCore_registerBatch_;');

function baseFacts(){
  return {
    members:[{member_id:'M1','氏名':'会員','状態':'有効'},{member_id:'M2','氏名':'会員2','状態':'有効'}],
    teachers:[{teacher_id:'T1','状態':'有効','出席受付可':true}],
    locations:[{location_id:'L1','状態':'有効'}],
    billingBlocks:[{billing_block_id:'B1',location_id:'L1','状態':'有効'}],
    trainingSlots:[
      {slot_id:'S1',location_id:'L1',billing_block_id:'B1','状態':'有効','稽古時間分':60},
      {slot_id:'S2',location_id:'L1',billing_block_id:'B1','状態':'有効','稽古時間分':90}
    ],
    attendances:[]
  };
}
function baseOptions(slots=['S1']){
  return {teacher_id:'T1',location_id:'L1',billing_block_id:'B1',attendance_session_id:'SESSION',attendance_date:'2099-07-09',target_month:'2099-07',attendance_items:[{member_id:'M1',slot_ids:slots}],require_teacher:true,initial_status:'有効',source:'equivalence',remarks:'same',sync_unselected:true,cancel_reason:'sync',message:'done'};
}
function runtime(){
  let id=0;
  const nowValue='2099-07-09T10:00:00+09:00';
  return {uuid:()=>String(++id),now:()=>nowValue,dateKey:value=>String(value??'').slice(0,10)};
}
function legacyPlan(options,facts){
  const writes=[];
  const rt=runtime();
  const deps={
    ensureSheetContext:value=>value||{},
    Utilities:{getUuid:rt.uuid,formatDate:value=>String(value??'').slice(0,10)},
    Session:{getScriptTimeZone:()=> 'Asia/Tokyo'},
    sup_now:rt.now,
    sup_today:()=> '2099-07-09',
    sup_targetMonth:()=> '2099-07',
    getMembers:()=>facts.members,
    getTeachers:()=>facts.teachers,
    getLocations:()=>facts.locations,
    getBillingBlocks:()=>facts.billingBlocks,
    getTrainingSlots:()=>facts.trainingSlots,
    daoContext_:value=>value,
    daoCore_:()=>({read:name=>facts[name],readAttendanceScopeRows:()=>facts.attendances}),
    cancelAttendanceRows:(rows,teacher,reason)=>{for(const row of rows) writes.push({kind:'update',row,values:{'状態':'取消','取消日時':rt.now(),'取消者teacher_id':teacher,'取消理由':reason}});},
    appendAttendanceRows:rows=>{for(const row of rows) writes.push({kind:'append',row});},
    paymentStatusView_projectAttendances_:(appended,cancelled)=>writes.push({kind:'projection',appended,cancelled})
  };
  const core=createLegacyCore(...dependencyNames.map(name=>deps[name]));
  return {result:core(options,{}),writes};
}
function nativePlan(options,facts){
  return makeAttendancePlan(options,facts,runtime());
}
function semanticLegacy(plan){
  return {
    result:plan.result,
    append:plan.writes.filter(w=>w.kind==='append').map(w=>w.row),
    cancel:plan.writes.filter(w=>w.kind==='update').map(w=>({attendance_id:w.row.attendance_id,slot_id:w.row.slot_id})),
    projectionCount:plan.writes.filter(w=>w.kind==='projection').length
  };
}
function semanticNative(plan){
  return {
    result:plan.result,
    append:plan.rowsToAppend,
    cancel:plan.rowsToCancel.map(row=>({attendance_id:row.attendance_id,slot_id:row.slot_id}))
  };
}
function assertEquivalent(options,facts){
  const legacy=semanticLegacy(legacyPlan(options,facts));
  const native=semanticNative(nativePlan(options,facts));
  assert.deepEqual(native.result,legacy.result);
  assert.deepEqual(native.append,legacy.append);
  assert.deepEqual(native.cancel,legacy.cancel);
  if(legacy.result.ok) assert.equal(legacy.projectionCount,1);
  return {legacy,native};
}

test('native make equals emulator for append',()=>{assertEquivalent(baseOptions(['S1','S2']),baseFacts());});
test('native make equals emulator for retain and cancel',()=>{
  const facts=baseFacts();
  facts.attendances=[
    {attendance_id:'OLD1','稽古日':'2099-07-09',member_id:'M1',location_id:'L1',billing_block_id:'B1',slot_id:'S1','状態':'有効'},
    {attendance_id:'OLD2','稽古日':'2099-07-09',member_id:'M1',location_id:'L1',billing_block_id:'B1',slot_id:'S2','状態':'有効'}
  ];
  assertEquivalent(baseOptions(['S1']),facts);
});
test('native make equals emulator for clear all',()=>{
  const facts=baseFacts();
  facts.attendances=[{attendance_id:'OLD1','稽古日':'2099-07-09',member_id:'M1',location_id:'L1',billing_block_id:'B1',slot_id:'S1','状態':'有効'}];
  assertEquivalent(baseOptions([]),facts);
});
test('native make equals emulator for member and slot validation results',()=>{
  const facts=baseFacts();
  const options=baseOptions();
  options.attendance_items=[{member_id:'BAD',slot_ids:['S1']},{member_id:'M1',slot_ids:['BAD']}];
  assertEquivalent(options,facts);
});
test('native make equals emulator for duplicate member validation',()=>{
  const facts=baseFacts();
  const options=baseOptions();
  options.attendance_items=[{member_id:'M1',slot_ids:['S1']},{member_id:'M1',slot_ids:['S2']}];
  assertEquivalent(options,facts);
});
