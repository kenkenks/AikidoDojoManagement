'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {createPaymentCashAcceptCommand}=require('../cloud/billing/payment-cash-accept-command.cjs');
const {createPaymentCashAcceptFirestoreExecutor,stableId}=require('../cloud/billing/payment-cash-accept-firestore.cjs');
const {createBillingMemberInfoReader}=require('../cloud/billing/member-info-firestore.cjs');
const {createPaymentScreenReader}=require('../cloud/billing/payment-screen-firestore.cjs');
const {createAttendanceRegistration}=require('../.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');

const HOST='127.0.0.1:8085',PROJECT='demo-fw002-emulator';
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST)throw Error('EMULATOR_HOST_NOT_CONFIRMED');
if(process.env.GCLOUD_PROJECT!==PROJECT||!PROJECT.startsWith('demo-'))throw Error('EMULATOR_PROJECT_NOT_CONFIRMED');

const app=initializeApp({projectId:PROJECT},'fw002-payment-cash-emulator');
const db=getFirestore(app);
const projection=(ctx={daoCore:{},timezone:'Asia/Tokyo',cache:{}},dependencies={})=>
  createAttendanceRegistration(ctx,{uuid:()=>{throw Error('UUID_FORBIDDEN');},...dependencies});
const clocks={main:{ok:true,timezone:'Asia/Tokyo',system_now:'2026-10-16 19:30:00',target_month:'2026-10'},
  trip:{ok:true,timezone:'Asia/Tokyo',system_now:'2025-04-03 09:15:00',target_month:'2026-10'}};
let currentClock=clocks.main;
const executor=createPaymentCashAcceptFirestoreExecutor(db,{getSystemContext:async()=>currentClock,
  createProjection:()=>projection(),serverTimestamp:()=>FieldValue.serverTimestamp()});
const command=createPaymentCashAcceptCommand({executeAtomic:executor});
const admin={uid:'ADMIN_EMULATOR',admin:true};

async function set(collection,id,data){await db.collection(collection).doc(id).set(data);}
function request(id,member,group,location='L1',block='B1'){return {request_id:id,location_id:location,billing_block_id:block,
  reception_session_id:'SESSION1',items:[{member_id:member,billing_group_id:group}]};}
function template(){const sandbox={};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('gas/20_PaymentStatusView.js','utf8'),sandbox);
  return structuredClone(sandbox.paymentStatusView_schemaTemplate_());}
async function seedMasters(){
  await set('dojos','L1',{location_id:'L1',display_name:'Dojo',status:'有効'});
  await set('billing_blocks','B1',{billing_block_id:'B1',location_id:'L1',display_name:'Evening',status:'有効',slots_per_charge:2});
}
async function seedMain(){
  await set('members','M1',{member_id:'M1',member_name:'Member 1',billing_group_id:'G1'});
  await set('members','M1F',{member_id:'M1F',member_name:'Member Family',billing_group_id:'G1'});
  const invoices=[
    {invoice_id:'I1',target_month:'2026-10',billing_group_id:'G1',member_id:'M1',plan_id:'P1','表示名':'A','請求予定額':2000,'金額':2000,'上限金額':3000,'支払状態':'未払い'},
    {invoice_id:'I2',target_month:'2026-10',billing_group_id:'G1',member_id:'M1F',plan_id:'P1','表示名':'B','請求予定額':1000,'金額':1000,'上限金額':3000,'支払状態':'未払い'}
  ];
  for(const row of invoices)await set('invoices',row.invoice_id,row);
  const oldPayment={payment_id:'P0','日時':'2026-10-01 10:00:00',target_month:'2026-10',billing_group_id:'G1',invoice_id:'I1',member_id:'M1',
    '支払方法':'現金','入金額':500,'決済ID':'LEGACY-P0','備考':'fixture',reception_date:'2026-10-01',location_id:'L1',billing_block_id:'B1',teacher_id:'',reception_session_id:'OLD'};
  await set('payments','P0',oldPayment);
  const facts=projection().projectReceptionSources({invoices,payments:[oldPayment],attendances:[]});
  const view={...template(),member_id:'M1',billing_group_id:'G1',target_month:'2026-10','会員名':'Member 1',
    invoice_items_json:JSON.stringify(facts.invoices),unpaid_invoice_items_json:JSON.stringify(facts.invoices),
    reception_payments_json:JSON.stringify(facts.payments),attendance_items_json:'[]'};
  await set('payment_status_views','V-M1-202610',view);
}
async function seedConcurrent(){
  await set('members','M2',{member_id:'M2',member_name:'Member 2',billing_group_id:'G2'});
  const invoice={invoice_id:'J1',target_month:'2026-10',billing_group_id:'G2',member_id:'M2',plan_id:'P1','表示名':'C','請求予定額':1200,'金額':1200,'上限金額':1200,'支払状態':'未払い'};
  await set('invoices','J1',invoice);
  const facts=projection().projectReceptionSources({invoices:[invoice],payments:[],attendances:[]});
  await set('payment_status_views','V-M2-202610',{...template(),member_id:'M2',billing_group_id:'G2',target_month:'2026-10','会員名':'Member 2',
    invoice_items_json:JSON.stringify(facts.invoices),unpaid_invoice_items_json:JSON.stringify(facts.invoices),reception_payments_json:'[]',attendance_items_json:'[]'});
}
async function seedFailure(){
  await set('members','M3',{member_id:'M3',member_name:'Member 3',billing_group_id:'G3'});
  await set('invoices','K1',{invoice_id:'K1',target_month:'2026-10',billing_group_id:'G3',member_id:'M3',plan_id:'P1','表示名':'D','請求予定額':800,'金額':800,'上限金額':800,'支払状態':'未払い'});
  const collision=stableId('PAY-','FAIL-1','K1');await set('payments',collision,{collision:true});return collision;
}
async function seedTrip(){
  await set('members','M4',{member_id:'M4',member_name:'Member 4',billing_group_id:'G4'});
  await set('invoices','T1',{invoice_id:'T1',target_month:'2026-10',billing_group_id:'G4',member_id:'M4',plan_id:'P1','表示名':'E','請求予定額':600,'金額':600,'上限金額':600,'支払状態':'未払い'});
}

(async()=>{
  const report={host:process.env.FIRESTORE_EMULATOR_HOST,project:PROJECT,tests:[]};
  try{
    await seedMasters();await seedMain();await seedConcurrent();await seedFailure();await seedTrip();

    const accepted=await command.execute(request('MAIN-1','M1','G1'),admin);
    assert.equal(accepted.accepted_amount,2500);assert.equal(accepted.payments.length,2);
    for(const item of accepted.payments){
      const [payment,evidence,invoice]=await Promise.all([
        db.collection('payments').doc(item.payment_id).get(),db.collection('paymentEvidences').doc(item.evidence_id).get(),db.collection('invoices').doc(item.invoice_id).get()]);
      assert.equal(payment.data().invoice_id,item.invoice_id);assert.equal(payment.data()['決済ID'],item.evidence_id);
      assert.equal(evidence.data().payment_log_id,item.payment_id);assert.equal(evidence.data().status,'POSTED');assert.equal(invoice.data()['支払状態'],'支払済');
    }
    report.tests.push('normal_multiple_invoice');

    const replay=await command.execute(request('MAIN-1','M1','G1'),admin);
    assert.equal(replay.idempotent_replay,true);assert.deepEqual(replay.payments,accepted.payments);
    assert.equal((await db.collection('payments').where('request_id','==','MAIN-1').get()).size,2);
    report.tests.push('idempotent_replay');

    const race=await Promise.allSettled([
      command.execute(request('RACE-A','M2','G2'),admin),command.execute(request('RACE-B','M2','G2'),admin)]);
    assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.filter(x=>x.status==='rejected').length,1);
    assert.match(race.find(x=>x.status==='rejected').reason.message,/PAYMENT_CASH_NOTHING_DUE/);
    assert.equal((await db.collection('payments').where('billing_group_id','==','G2').get()).size,1);
    assert.equal((await db.collection('invoices').doc('J1').get()).data()['支払状態'],'支払済');
    report.tests.push('concurrent_single_winner');

    await assert.rejects(command.execute(request('FAIL-1','M3','G3'),admin),/ALREADY_EXISTS|already exists/i);
    assert.equal((await db.collection('paymentEvidences').doc(stableId('CASH-','FAIL-1','K1')).get()).exists,false);
    assert.equal((await db.collection('payment_cash_requests').doc('FAIL-1').get()).exists,false);
    assert.equal((await db.collection('invoices').doc('K1').get()).data()['支払状態'],'未払い');
    report.tests.push('atomic_rollback');

    currentClock=clocks.trip;const trip=await command.execute(request('TIME-1','M4','G4'),admin);
    const tripPayment=(await db.collection('payments').doc(trip.payments[0].payment_id).get()).data();
    assert.equal(tripPayment['日時'],'2025-04-03 09:15:00');assert.equal(tripPayment.reception_date,'2025-04-03');
    assert.ok(tripPayment.recorded_at instanceof Timestamp);assert.ok(tripPayment.recorded_at.toMillis()>Date.now()-120000);
    report.tests.push('time_trip_audit_split');currentClock=clocks.main;

    const memberReader=createBillingMemberInfoReader(db,{getSystemContext:async()=>currentClock,createProjection:projection});
    const member=await memberReader('M1');assert.equal(member.unpaidAmount,0);assert.equal(member.status,'支払済');
    report.tests.push('member_reader_consistent');

    const screenReader=createPaymentScreenReader(db,{getSystemContext:async()=>currentClock,createProjection:projection});
    const screen=await screenReader({location_id:'L1',billing_block_id:'B1',reception_date:'2026-10-16',target_month:'2026-10',payment_method:'CASH'});
    assert.equal(screen.ok,true);assert.equal(screen.summary.cash_total,3700);assert.equal(screen.posted.evidences.length,4);
    assert.equal(screen.posted.evidences.filter(item=>accepted.payments.some(p=>p.evidence_id===item.evidence_id)).length,2);
    report.tests.push('payment_screen_reader_consistent_with_stale_view');

    report.counts={payments:(await db.collection('payments').get()).size,evidences:(await db.collection('paymentEvidences').get()).size,
      requests:(await db.collection('payment_cash_requests').get()).size};
    process.stdout.write(JSON.stringify({ok:true,...report},null,2)+'\n');
  }finally{await deleteApp(app);}
})().catch(error=>{console.error(error?.stack||error);process.exitCode=1;});
