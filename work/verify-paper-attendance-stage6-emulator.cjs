'use strict';
process.env.TZ='Asia/Tokyo';
const assert=require('node:assert/strict');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createAttendanceCore}=require('../adapters/firestore/DAO_Core.js');
const {createAttendanceRegistrationTarget}=require('../cloud/time-travel/target.cjs');
const {createPendingAttendanceApproval}=require('../cloud/attendance/pending-approval-firestore.cjs');
const {projectAttendanceProgress}=require('../cloud/attendance/progress-summary.cjs');
const {createAttendanceSavedState}=require('../cloud/attendance/saved-state.cjs');
const HOST='127.0.0.1:8086',PROJECT='demo-paper-attendance-stage6';
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST)throw Error('EMULATOR_HOST_NOT_CONFIRMED');
if(process.env.GCLOUD_PROJECT!==PROJECT&&process.env.GOOGLE_CLOUD_PROJECT!==PROJECT)throw Error('EMULATOR_PROJECT_NOT_CONFIRMED');
const db=getFirestore(initializeApp({projectId:PROJECT},'paper-stage6'));
const put=(collection,id,value)=>db.collection(collection).doc(id).set(value);
async function attendanceRows(){return (await db.collection('attendances').get()).docs.map(doc=>doc.data());}
async function progress(){return projectAttendanceProgress({member:{member_id:'M1',member_name:'会員',status:'有効'},attendanceRows:await attendanceRows(),standard:{progress_display_enabled:false},rankOption:{}});}
(async()=>{
  await Promise.all([
    put('settings','TIME_TRAVEL_ENABLED',{key:'TIME_TRAVEL_ENABLED',value:'TRUE'}),put('settings','DEBUG_DATE',{key:'DEBUG_DATE',value:'2026-10-12T10:00:00+09:00'}),put('settings','DEBUG_TARGET_MONTH',{key:'DEBUG_TARGET_MONTH',value:'2026-10'}),
    put('members','M1',{member_id:'M1',member_name:'会員',status:'有効',billing_group_id:'BG1',member_type:'一般',current_rank:'成人無級'}),
    put('dojos','PAPER_UNKNOWN_LOCATION',{location_id:'PAPER_UNKNOWN_LOCATION',status:'有効',display_name:'紙取込'}),
    put('billing_blocks','PAPER_UNKNOWN_BILLING_BLOCK',{billing_block_id:'PAPER_UNKNOWN_BILLING_BLOCK',location_id:'PAPER_UNKNOWN_LOCATION',status:'有効',slots_per_charge:8,maximum_training_slots:8,billing_allowed:false}),
    ...Array.from({length:8},(_,index)=>put('training_slots','PAPER_UNKNOWN_SLOT_'+(index+1),{slot_id:'PAPER_UNKNOWN_SLOT_'+(index+1),location_id:'PAPER_UNKNOWN_LOCATION',billing_block_id:'PAPER_UNKNOWN_BILLING_BLOCK',status:'有効',duration_minutes:60,attendance_allowed:true,billing_allowed:false})),
    put('fees','P1',{plan_id:'P1',display_name:'テスト',membership_fee_type:'回数料金',unit_price:1000,maximum_amount:5000,status:'有効'}),put('plan_selection_rules','R1',{plan_selection_rule_id:'R1',member_type:'一般',selectable_plan_id:'P1'})
  ]);
  const core=createAttendanceCore(db,{createRegistration:createAttendanceRegistrationTarget,uuid:()=> 'ATT_STAGE6'}),input={teacher_id:'',location_id:'PAPER_UNKNOWN_LOCATION',billing_block_id:'PAPER_UNKNOWN_BILLING_BLOCK',attendance_date:'2026-10-12',attendance_session_id:'PAPER_MEMBER',attendance_items:[{member_id:'M1',current_rank:'成人無級',plan_id:'',slot_ids:['PAPER_UNKNOWN_SLOT_1']}],source:'paper_attendance_member',skip_billing:true,member_submission_authorized:true};
  const first=await core.register(input);assert.equal(first.ok,true);let rows=await attendanceRows();assert.equal(rows.length,1);assert.equal(rows[0]['状態'],'確認待ち');assert.equal((await progress()).training_count,0);
  const repeatPending=await core.register(input);assert.equal(repeatPending.ok,true);assert.equal((await attendanceRows()).length,1);
  const saved=createAttendanceSavedState({memberDao:{readById:async()=>({status:'有効'})},attendanceDao:{queryEqual:async()=>attendanceRows()}});assert.deepEqual((await saved({member_id:'M1',attendance_date:'2026-10-12',location_id:'PAPER_UNKNOWN_LOCATION',billing_block_id:'PAPER_UNKNOWN_BILLING_BLOCK'})).selected_slot_ids,['PAPER_UNKNOWN_SLOT_1']);
  const approval=createPendingAttendanceApproval(db,{serverTimestamp:()=>new Date('2026-10-12T11:00:00Z')}),id=rows[0].attendance_id;
  assert.equal((await approval.confirm({attendance_id:id},{teacher_id:'T1'})).confirmed_count,1);rows=await attendanceRows();assert.equal(rows.length,1);assert.equal(rows[0]['状態'],'確認済');assert.equal((await progress()).training_count,1);
  assert.equal((await approval.confirm({attendance_id:id},{teacher_id:'T1'})).already_confirmed,true);assert.equal((await attendanceRows()).length,1);
  const repeatApproved=await core.register(input);assert.equal(repeatApproved.ok,true);rows=await attendanceRows();assert.equal(rows.length,1);assert.equal(rows[0]['状態'],'確認済');assert.equal((await progress()).training_count,1);
  assert.equal((await db.collection('invoices').get()).size,0);assert.equal((await db.collection('monthly_selections').get()).size,0);assert.equal((await db.collection('payment_status_views').get()).size,0);
  console.log('PASS emulator pending -> approve -> replay -> aggregate flow');
})().catch(error=>{console.error(error);process.exitCode=1;});
