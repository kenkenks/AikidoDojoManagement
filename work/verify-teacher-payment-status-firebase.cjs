'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createTeacherPaymentStatusReader}=require('../cloud/billing/teacher-payment-status-firestore.cjs');
const {createAdminApi}=require('../cloud/api/admin-api.cjs');
const WebConnectCore=require('../shared/WebConnectCore.js');
const {createAttendanceRegistration}=require('../.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');

let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name);}
const rows={
  members:[{member_id:'M001',member_name:'桜一郎',billing_group_id:'G001',status:'在籍'}],
  invoices:[{invoice_id:'I001',target_month:'2026-10',billing_group_id:'G001',member_id:'M001',plan_id:'P002','請求予定額':1500,'金額':1500,'表示名':'回数制'}],
  payments:[{payment_id:'PAY1','日時':'2026-10-10 12:00:00',target_month:'2026-10',billing_group_id:'G001',member_id:'M001',invoice_id:'I001','支払方法':'CASH','入金額':1500}],
  attendances:[{attendance_id:'A1',member_id:'M001',target_month:'2026-10','稽古日':'2026-10-05',billing_block_id:'B1',slot_id:'S1','状態':''}],
  billing_blocks:[{billing_block_id:'B1',location_id:'HONBU',slots_per_charge:2,status:'有効'}]
};
function fakeDb(){
  const db={collection(name){let filters=[];return {where(key,_op,value){filters.push([key,value]);return this;},limit(){return {name,filters};}};},
    async runTransaction(callback,options){assert.deepEqual(options,{readOnly:true});return callback({async get(ref){const source=rows[ref.name].filter(row=>ref.filters.every(([k,v])=>row[k]===v));return {docs:source.map((data,index)=>({id:data.payment_id||data.invoice_id||data.attendance_id||data.member_id||data.billing_block_id||String(index),data:()=>data}))};}});}};
  return db;
}
const systemContext=async()=>({ok:true,timezone:'Asia/Tokyo',target_month:'2026-10',system_now:'2026-10-20 10:00:00'});

(async()=>{
  await test('GAS projection contract is reproduced from Firestore facts',async()=>{
    const reader=createTeacherPaymentStatusReader(fakeDb(),{getSystemContext:systemContext,createProjection:createAttendanceRegistration});
    const result=await reader({target_month:'2026-10',date_from:'2026-10-01',date_to:'2026-10-31'});
    assert.deepEqual(result.summary,{cash_total:1500,paypay_total:0,other_total:0,total_amount:1500,payment_count:1});
    assert.equal(result.members[0].lesson_count,1);assert.equal(result.members[0].status,'支払済');
    assert.equal(result.payments[0].payment_method_label,'現金');
  });
  await test('invalid input is rejected before Firestore transaction',async()=>{
    let called=false;const db=fakeDb(),original=db.runTransaction;db.runTransaction=(...args)=>{called=true;return original(...args);};
    const reader=createTeacherPaymentStatusReader(db,{getSystemContext:systemContext,createProjection:()=>({})});
    await assert.rejects(()=>reader({target_month:'2026-13'}),/INVALID_TEACHER_PAYMENT_STATUS_PARAMS/);assert.equal(called,false);
  });
  await test('WebConnect maps only the existing teacher payment status action',async()=>{
    assert.deepEqual(WebConnectCore.resolve('teacher_payment_status',{target_month:'2026-10'}),{operation:'billing.teacherPaymentStatus',input:{target_month:'2026-10'}});
  });
  const base={getTimeTravel:async()=>({}),saveTimeTravel:async()=>({}),getSystemContext:systemContext,readMember:async()=>null,readMembers:async()=>[],
    verifyIdToken:async token=>({uid:token,admin:token==='admin'}),resolveDojoPrincipal:async user=>user.uid==='teacher'?{teacher_id:'T001'}:{member_id:'M001'},
    isActiveTeacher:async id=>id==='T001',readTeacherPaymentStatus:async input=>({ok:true,input,members:[],payments:[],summary:{}})};
  await test('active teacher and admin are authorized',async()=>{
    const api=createAdminApi(base);for(const token of ['teacher','admin']){const response=await api({operation:'billing.teacherPaymentStatus',input:{target_month:'2026-10'},method:'GET',authorization:'Bearer '+token});assert.equal(response.status,200);}
  });
  await test('member and unauthenticated requests are rejected',async()=>{
    const api=createAdminApi(base);assert.equal((await api({operation:'billing.teacherPaymentStatus',input:{},method:'GET',authorization:'Bearer member'})).status,403);
    assert.equal((await api({operation:'billing.teacherPaymentStatus',input:{},method:'GET'})).status,401);
  });
  await test('screen keeps GAS JSONP and adds Firebase Auth transport',async()=>{
    const html=fs.readFileSync('web/qr/payment_status.html','utf8');
    for(const text of ['firebase_auth.js','auth_gate.js','dojo_api_client.js','window.DOJO_RUNTIME_CONFIG.runtime === "firebase"','paymentStatusApi.request','jsonp(GAS_URL, params)'])assert.ok(html.includes(text),text);
  });
  console.log(`${passed}/${passed} PASS`);
})().catch(error=>{console.error(error);process.exitCode=1;});
