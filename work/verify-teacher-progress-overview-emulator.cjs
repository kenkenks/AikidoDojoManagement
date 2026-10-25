'use strict';
process.env.TZ='Asia/Tokyo';
const assert=require('node:assert/strict');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createFirestoreCore}=require('../cloud/member-read/DAO_Core_Firestore.cjs');
const {createFirestoreProgressBatchReader}=require('../cloud/attendance/progress-firestore.cjs');
const HOST='127.0.0.1:8086',PROJECT='demo-teacher-progress-stage5';
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST)throw Error('EMULATOR_HOST_NOT_CONFIRMED');
if(process.env.GCLOUD_PROJECT!==PROJECT&&process.env.GOOGLE_CLOUD_PROJECT!==PROJECT)throw Error('EMULATOR_PROJECT_NOT_CONFIRMED');
const db=getFirestore(initializeApp({projectId:PROJECT},'teacher-progress-stage5'));
const put=(collection,id,value)=>db.collection(collection).doc(id).set(value);
(async()=>{
  await Promise.all([
    put('members','M1',{member_id:'M1',member_name:'一郎',status:'在籍',current_rank:'成人無級',rank_start_date:'2026-01-01'}),
    put('members','M2',{member_id:'M2',member_name:'二郎',status:'有効',current_rank:'5級',rank_start_date:'2026-01-01',carried_training_count:1}),
    put('members','M3',{member_id:'M3',member_name:'退会者',status:'退会',current_rank:'成人無級'}),
    put('ranks','R1',{rank_id:'R1','状態':'有効','表示名':'成人無級','表示順':1}),put('ranks','R2',{rank_id:'R2','状態':'有効','表示名':'5級','表示順':2}),
    put('examination_standards','ES1',{'状態':'有効','現在級段位':'成人無級','次回審査級段位':'5級','必要稽古数':5,'進捗表示対象':true}),
    put('examination_standards','ES2',{'状態':'有効','現在級段位':'5級','次回審査級段位':'4級','必要稽古数':8,'進捗表示対象':true}),
    put('attendances','A1',{attendance_id:'A1',member_id:'M1','稽古日':'2026-10-01',slot_id:'S1','状態':'確認済'}),
    put('attendances','A2',{attendance_id:'A2',member_id:'M1','稽古日':'2026-10-02',slot_id:'S1','状態':'確認済'}),
    put('attendances','A3',{attendance_id:'A3',member_id:'M1','稽古日':'2026-10-03',slot_id:'S1','状態':'確認待ち'}),
    put('attendances','A4',{attendance_id:'A4',member_id:'M2','稽古日':'2026-10-01',slot_id:'S1','状態':'確認済'})]);
  const core=createFirestoreCore({projectId:PROJECT,mode:'emulator',host:HOST});
  const result=await createFirestoreProgressBatchReader(core,{getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',system_now:'2026-10-25 12:00:00'})})();
  assert.equal(result.member_count,2);assert.deepEqual(result.progress_items.map(item=>item.member_id),['M1','M2']);
  assert.equal(result.progress_items[0].training_count,2);assert.equal(result.progress_items[0].forecast_label,'算出不可');
  assert.equal(result.progress_items[1].training_count,2);assert.equal(result.progress_items[1].current_rank,'5級');
  console.log('PASS emulator bulk progress DTO: 2 active members, 4 attendance records');
})().catch(error=>{console.error(error);process.exitCode=1;});
