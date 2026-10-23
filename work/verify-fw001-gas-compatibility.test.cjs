'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createSystemSessionInfo}=require('../cloud/attendance/session-info.cjs');
const {createBillingFirestoreReader}=require('../cloud/attendance/billing-firestore.cjs');
const location={location_id:'L1'},billingBlocks=[
  {location_id:'L1',billing_block_id:'AM','曜日':'月'},
  {location_id:'L1',billing_block_id:'PM','曜日':'月'}];
const trainingSlots=[
  {location_id:'L1',billing_block_id:'AM',slot_id:'S1','開始時刻':'10:30','終了時刻':'12:30'},
  {location_id:'L1',billing_block_id:'PM',slot_id:'S2','開始時刻':'19:30','終了時刻':'21:30'}];
const masters=async()=>({location,billingBlocks,trainingSlots});
function gasClock(context){
  const format=(date,zone,f)=>{
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
    return f==='u'?String({Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7}[p.weekday]):p.hour+':'+p.minute;
  };
  const sandbox={ensureSheetContext:c=>c,getLocations:()=>[location],getBillingBlocks:()=>billingBlocks,
    getTrainingSlots:()=>trainingSlots,sup_now:()=>new Date(context.system_now.replace(' ','T')+'+09:00'),
    Session:{getScriptTimeZone:()=> 'Asia/Tokyo'},Utilities:{formatDate:format}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('gas/04_Attendance.js','utf8'),sandbox);return sandbox;
}
test('authoritative SystemContext clock selects Monday AM/PM with GAS parity; client at ignored',async()=>{
  for(const [clock,id]of [['2026-10-26 10:30:00','AM'],['2026-10-26 19:30:00','PM']]){
    const ctx={ok:true,timezone:'Asia/Tokyo',time_travel_enabled:true,system_now:clock};
    const result=await createSystemSessionInfo({readSessionMasters:masters,getSystemContext:async()=>ctx})({location_id:'L1',at:'2026-10-29T00:00:00Z'});
    assert.equal(result.billing_block_id,id);
    assert.deepEqual(JSON.parse(JSON.stringify(result)),JSON.parse(JSON.stringify(gasClock(ctx).getAttendanceSessionInfo({location_id:'L1'},{}))));
  }
});
test('disabled TimeTravel still uses the SystemContext real clock',async()=>{
  const result=await createSystemSessionInfo({readSessionMasters:masters,getSystemContext:async()=>({ok:true,timezone:'Asia/Tokyo',time_travel_enabled:false,system_now:'2026-10-26 10:30:00'})})({location_id:'L1'});
  assert.equal(result.billing_block_id,'AM');
});
test('failed, missing, wrong-zone and invalid SystemContext fail without master access or real-clock fallback',async()=>{
  let reads=0;
  for(const ctx of [null,{ok:false},{ok:true,timezone:'UTC',system_now:'2026-10-26 10:30:00'},
    {ok:true,timezone:'Asia/Tokyo',system_now:'2026-02-30 10:30:00'}]){
    await assert.rejects(createSystemSessionInfo({readSessionMasters:async()=>{reads++;},getSystemContext:async()=>ctx})({location_id:'L1'}),/SYSTEM_CONTEXT/);
  }
  await assert.rejects(createSystemSessionInfo({readSessionMasters:masters,getSystemContext:async()=>{throw Error('offline');}})({location_id:'L1'}),/offline/);
  assert.equal(reads,0);
});
const member={member_id:'M1',member_type:'一般'};
const fee={plan_id:'P001',display_name:'テスト月額',membership_fee_type:'月額',unit_price:1000,maximum_amount:3000,status:'有効'};
function reader(row){return createBillingFirestoreReader({readById:async()=>null,queryEqual:async()=>[],
  readPage:async({collection})=>({documents:collection==='fees'?[{id:'P001',fields:row}]:[{fields:{member_type:'一般',selectable_plan_id:'P001'}}],nextPageToken:null})
},{monthlySelectionCollection:'monthly_selections',targetMonth:async()=> '2026-10'});}
test('Fee physical fields map directly to the existing display/type/amount/cap DTO',async()=>{
  const result=await reader(fee)(member);
  const sandbox={ensureSheetContext:c=>c,normalizeId_:v=>String(v??'').trim(),sup_targetMonth:()=> '2026-10',
    getFees:()=>[{plan_id:'P001','表示名':'テスト月額','会費タイプ':'月額','回数単価':1000,'上限金額':3000,'状態':'有効'}],
    getPlanSelectionRules:()=>[{member_type:'一般',selectable_plan_id:'P001'}],isActiveMasterRow_:()=>true};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('gas/04_Attendance.js','utf8'),sandbox);
  assert.deepEqual(result,JSON.parse(JSON.stringify(sandbox.attendance_getBillingSelectionState_(member,{}))));
  assert.equal(result.candidates[0].plan_name,'テスト月額');assert.equal(result.candidates[0].amount,1000);assert.equal(result.candidates[0].cap_amount,3000);
});
test('Fee nonfinite, negative and malformed amount/cap fail closed',async()=>{
  for(const field of ['unit_price','maximum_amount'])for(const value of ['bad',Infinity,-1,true])
    await assert.rejects(reader({...fee,[field]:value})(member),/INVALID_FEE_AMOUNT/);
});
test('Firebase clock change invalidates explicit block, ignores old responses and requests a fresh selection; GAS unchanged',()=>{
  const html=fs.readFileSync('web/qr/attendance.html','utf8');
  const start=html.indexOf('    function handleAttendanceContextChange() {');
  const end=html.indexOf('    function handleAttendanceInitializationError',start);
  assert.ok(start>0&&end>start);
  const body=html.slice(start,end)+'\nhandleAttendanceContextChange();';
  const ctx={attendanceClockKey:'old',attendanceInfoRequestSeq:4,
    attendanceInfoInFlightKey:'old',attendanceInfoLoadedKey:'old',currentBillingBlockId:'AM',currentSlots:[1],submitting:false,
    document:{getElementById:()=>({})},currentAttendanceDate:()=>'',attendanceBusinessClockKey:()=> 'new',
    clearCandidates(){},persistAttendanceContext(){},renderKeys(){}};
  vm.createContext(ctx);vm.runInContext(body,ctx);
  assert.equal(ctx.currentBillingBlockId,'');assert.equal(ctx.attendanceInfoRequestSeq,5);
  assert.match(html,/attendanceInitializationManager\.retry\("system_context_changed"\)/);
  assert.match(html,/if \(IS_FIREBASE_ATTENDANCE\) initializeFirebaseAttendancePage\(\);[\s\S]*?else \{[\s\S]*?initializeAttendanceContext\(\);/);
});
