const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeAttendancePlan}=require('../shared/AttendanceNative.js');

const facts=()=>({
  members:[{member_id:'M1','状態':'有効'}],
  teachers:[{teacher_id:'T1','状態':'有効','出席受付可':true}],
  locations:[{location_id:'L1','状態':'有効'}],
  billingBlocks:[{billing_block_id:'B1',location_id:'L1','状態':'有効'}],
  trainingSlots:[
    {slot_id:'S1',location_id:'L1',billing_block_id:'B1','状態':'有効','稽古時間分':60},
    {slot_id:'S2',location_id:'L1',billing_block_id:'B1','状態':'有効','稽古時間分':60}
  ],
  attendances:[]
});
function deps(){let n=0;return {uuid:()=>String(++n),now:()=>new Date('2099-07-09T01:00:00Z'),dateKey:v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10)}}
function options(slots){return {teacher_id:'T1',location_id:'L1',billing_block_id:'B1',attendance_session_id:'SESSION',attendance_date:'2099-07-09',target_month:'2099-07',attendance_items:[{member_id:'M1',slot_ids:slots}],require_teacher:true,initial_status:'有効',sync_unselected:true}}

test('native make plans append without storage side effects',()=>{
  const plan=makeAttendancePlan(options(['S1','S2']),facts(),deps());
  assert.deepEqual([plan.result.registered_count,plan.result.retained_count,plan.result.cancelled_count],[2,0,0]);
  assert.equal(plan.rowsToAppend.length,2); assert.equal(plan.rowsToCancel.length,0);
});

test('native make plans retain and cancel from collected facts',()=>{
  const f=facts();
  f.attendances=[
    {attendance_id:'A1','稽古日':'2099-07-09',member_id:'M1',location_id:'L1',billing_block_id:'B1',slot_id:'S1','状態':'有効'},
    {attendance_id:'A2','稽古日':'2099-07-09',member_id:'M1',location_id:'L1',billing_block_id:'B1',slot_id:'S2','状態':'有効'}
  ];
  const plan=makeAttendancePlan(options(['S1']),f,deps());
  assert.deepEqual([plan.result.registered_count,plan.result.retained_count,plan.result.cancelled_count],[0,1,1]);
  assert.equal(plan.rowsToAppend.length,0); assert.equal(plan.rowsToCancel[0].attendance_id,'A2');
});

test('native make preserves validation result contract',()=>{
  const input=options(['S1']); input.teacher_id='';
  assert.deepEqual(makeAttendancePlan(input,facts(),deps()).result,{ok:false,message:'先生・道場・課金枠を指定してください。'});
});
