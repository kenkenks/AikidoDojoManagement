const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const coreSource=['gas/04_Attendance.js','gas/04_AttendanceCore.js','gas/DAO_Business_Attendance.js']
  .map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
const dependencyNames=['ensureSheetContext','Utilities','Session','sup_now','sup_today','sup_targetMonth','getMembers','daoMemberGetAll_','getTeachers','getLocations','getBillingBlocks','getTrainingSlots','daoContext_','daoCore_','cancelAttendanceRows','appendAttendanceRows','paymentStatusView_projectAttendances_'];
const createCore=new Function(...dependencyNames,coreSource+'\nreturn attendanceCore_registerBatch_;');

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
  return {teacher_id:'T1',location_id:'L1',billing_block_id:'B1',attendance_session_id:'SESSION',attendance_date:'2099-07-09',target_month:'2099-07',attendance_items:[{member_id:'M1',slot_ids:slots}],require_teacher:true,initial_status:'有効',source:'regression',remarks:'same',sync_unselected:true,cancel_reason:'sync',message:'done'};
}
function runCore(options,facts){
  const writes=[];
  let id=0;
  const now=()=> '2099-07-09T10:00:00+09:00';
  const deps={
    ensureSheetContext:value=>value||{},
    Utilities:{getUuid:()=>String(++id),formatDate:value=>String(value??'').slice(0,10)},
    Session:{getScriptTimeZone:()=> 'Asia/Tokyo'},
    sup_now:now,
    sup_today:()=> '2099-07-09',
    sup_targetMonth:()=> '2099-07',
    getMembers:()=>facts.members,
    daoMemberGetAll_:()=>facts.members.map(row=>({member_id:row.member_id,member_name:row['氏名'],status:row['状態']})),
    getTeachers:()=>facts.teachers,
    getLocations:()=>facts.locations,
    getBillingBlocks:()=>facts.billingBlocks,
    getTrainingSlots:()=>facts.trainingSlots,
    daoContext_:value=>value,
    daoCore_:()=>({read:name=>facts[name],readAttendanceScopeRows:()=>facts.attendances}),
    cancelAttendanceRows:(rows,teacher,reason)=>{for(const row of rows) writes.push({kind:'cancel',row,teacher,reason});},
    appendAttendanceRows:rows=>{for(const row of rows) writes.push({kind:'append',row});},
    paymentStatusView_projectAttendances_:(appended,cancelled)=>writes.push({kind:'projection',appended,cancelled})
  };
  const core=createCore(...dependencyNames.map(name=>deps[name]));
  return {result:core(options,{}),writes};
}
function writesOf(run,kind){return run.writes.filter(write=>write.kind===kind);}

test('canonical Attendance Core appends selected slots',()=>{
  const run=runCore(baseOptions(['S1','S2']),baseFacts());
  assert.equal(run.result.ok,true);
  assert.deepEqual([run.result.registered_count,run.result.retained_count,run.result.cancelled_count],[2,0,0]);
  assert.deepEqual(writesOf(run,'append').map(write=>write.row.slot_id),['S1','S2']);
  assert.equal(writesOf(run,'projection').length,1);
});

test('canonical Attendance Core retains selected and cancels unselected slots',()=>{
  const facts=baseFacts();
  facts.attendances=[
    {attendance_id:'OLD1','稽古日':'2099-07-09',member_id:'M1',location_id:'L1',billing_block_id:'B1',slot_id:'S1','状態':'有効'},
    {attendance_id:'OLD2','稽古日':'2099-07-09',member_id:'M1',location_id:'L1',billing_block_id:'B1',slot_id:'S2','状態':'有効'}
  ];
  const run=runCore(baseOptions(['S1']),facts);
  assert.deepEqual([run.result.registered_count,run.result.retained_count,run.result.cancelled_count],[0,1,1]);
  assert.deepEqual(run.result.results[0].retained_slot_ids,['S1']);
  assert.deepEqual(run.result.results[0].cancelled_slot_ids,['S2']);
  assert.deepEqual(writesOf(run,'cancel').map(write=>write.row.attendance_id),['OLD2']);
});

test('canonical Attendance Core clears all selected slots in synchronization mode',()=>{
  const facts=baseFacts();
  facts.attendances=[{attendance_id:'OLD1','稽古日':'2099-07-09',member_id:'M1',location_id:'L1',billing_block_id:'B1',slot_id:'S1','状態':'有効'}];
  const run=runCore(baseOptions([]),facts);
  assert.equal(run.result.ok,true);
  assert.deepEqual([run.result.registered_count,run.result.retained_count,run.result.cancelled_count],[0,0,1]);
  assert.deepEqual(writesOf(run,'cancel').map(write=>write.row.attendance_id),['OLD1']);
});

test('canonical Attendance Core reports invalid member and slot without writes',()=>{
  const options=baseOptions();
  options.attendance_items=[{member_id:'BAD',slot_ids:['S1']},{member_id:'M1',slot_ids:['BAD']}];
  const run=runCore(options,baseFacts());
  assert.equal(run.result.ok,true);
  assert.match(run.result.results[0].errors[0],/有効な会員/);
  assert.match(run.result.results[1].errors[0],/無効な稽古枠/);
  assert.equal(writesOf(run,'append').length,0);
  assert.equal(writesOf(run,'cancel').length,0);
});

test('canonical Attendance Core rejects duplicate member request',()=>{
  const options=baseOptions();
  options.attendance_items=[{member_id:'M1',slot_ids:['S1']},{member_id:'M1',slot_ids:['S2']}];
  const run=runCore(options,baseFacts());
  assert.equal(run.result.ok,true);
  assert.deepEqual(run.result.results[0].registered_slot_ids,['S1']);
  assert.match(run.result.results[1].errors[0],/同じ会員/);
  assert.deepEqual(writesOf(run,'append').map(write=>write.row.slot_id),['S1']);
});
