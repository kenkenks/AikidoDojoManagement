'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(require('node:path').join(__dirname,'FW002_candidate_00051_payment_screen.browser.js'),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(block){
  const list=status=>({ok:true,success:true,target_month:'2026-10',statuses:[status],payment_method:'PAYPAY',location_id:'',billing_block_id:'',count:0,total_amount:0,evidences:[]});
  const morning=block==='B_KYO_MON_1030_1230';
  return {ok:true,summary:{ok:true,reception_date:'2026-10-26',location_id:'HONBU',billing_block_id:block,cash_total:0,paypay_total:0,other_total:0,total_amount:0,payment_count:0,payments:[],expected_total:morning?2000:0,outstanding_total:morning?2000:0,attendance_member_count:morning?2:0,
    reconciliation_items:morning?[{status:'ATTENDED_UNPAID',label:'SECRET_NAME',billing_group_id:'G1',amount:1000,member_ids:['M1'],member_names:['SECRET_NAME']},{status:'ATTENDED_UNPAID',label:'SECRET_NAME_2',billing_group_id:'G2',amount:1000,member_ids:['M2'],member_names:['SECRET_NAME_2']}]:[]},confirmed:list('CONFIRMED'),posted:list('POSTED')};
}
async function run({status=200,mutate,missingClient=false,communication=false,badClock=false,badJson=false}={}){
  const logs=[],calls=[];
  const sandbox={URL,AbortSignal,location:{href:'https://dojo-management-dev.web.app/qr/qr_generator.html'},RUNTIME_CONFIG:{target:'dev-firebase',firebase:{projectId:'dojo-management-dev'}},
    firebaseAuthClient:{ready:Promise.resolve(),getCurrentUser:()=>({})},console:{log:s=>logs.push(JSON.parse(s))}};
  if(!missingClient)sandbox.dojoApiClient={request:async(url,init)=>{
    const u=new URL(url);assert.equal(u.origin,'https://candidate---dojo-time-travel-admin-q6ujypei6a-an.a.run.app');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
    calls.push(u.searchParams.get('action'));if(communication)throw Error('SECRET_TOKEN');
    const clock=calls.at(-1)==='system_context';let body=clock?{ok:true,timezone:'Asia/Tokyo',time_travel_enabled:true,system_now:badClock?'invalid':'2026-10-26 10:30:00',target_month:'2026-10'}:fixture(u.searchParams.get('billing_block_id'));
    if(!clock&&mutate)body=mutate(clone(body));
    return {status:clock?200:status,json:async()=>{if(!clock&&badJson)throw Error('SECRET_RESPONSE');return body;}};
  }};
  await vm.runInNewContext(script,sandbox);
  assert(logs.every(x=>Object.keys(x).sort().join(',')==='reason,result'));
  assert(!JSON.stringify(logs).includes('SECRET'));
  return {logs,calls};
}
test('zero evidence: both scopes PASS, coverage remains unconfirmed; GET only',async()=>{
  const r=await run();assert.equal(r.calls.length,3);assert(!r.logs.some(x=>x.result==='FAIL'));assert(r.logs.filter(x=>x.result==='未確認').length>=5);
});
test('preflight mismatch reports strict expected and actual counts without member data',async()=>{
  const r=await run({mutate:b=>{b.summary.attendance_member_count=3;return b;}});
  const failure=r.logs.at(-1);assert.equal(failure.result,'FAIL');
  assert.match(failure.reason,/expected=\{"payment_count":0,"attendance_member_count":2,"reconciliation_count":2,"attended_unpaid_count":2\}/);
  assert.match(failure.reason,/actual=\{"payment_count":0,"attendance_member_count":3,"reconciliation_count":2,"attended_unpaid_count":2\}/);
  assert(!failure.reason.includes('SECRET'));
});
test('undefined client fails safely before any request',async()=>{const r=await run({missingClient:true});assert.equal(r.calls.length,0);assert.equal(r.logs.at(-1).result,'FAIL');});
test('nonempty GAS evidence DTO passes without disclosing fields',async()=>{
  const r=await run({mutate:b=>{
    for(const [key,status]of [['confirmed','CONFIRMED'],['posted','POSTED']]){
      b[key].count=1;b[key].total_amount=500;
      b[key].evidences=[{evidence_id:status==='POSTED'?'E2':'E1',invoice_id:'I1',member_id:'M1',billing_group_id:'G1',plan_id:'P1',target_month:'2026-10',status,payment_method:'PAYPAY',amount:500,
        member_name:'SECRET_NAME',label:'SECRET_LABEL',payment_method_label:'PayPay',evidence_code:'SECRET_CODE',reception_date:'2026-10-25',requested_at:'2026/10/25 10:00:00',confirmed_at:'2026/10/25 10:01:00',
        posted_at:status==='POSTED'?'2026/10/25 10:02:00':'',payment_log_id:status==='POSTED'?'PAY1':'',location_id:'OTHER',billing_block_id:'OTHER',remarks:'SECRET_REMARKS'}];
    }return b;
  }});
  assert.equal(r.calls.length,3);assert(!r.logs.some(x=>x.result==='FAIL'));
});
for(const status of [401,403,409,500,503])test('HTTP '+status+' stops before second scope',async()=>{const r=await run({status});assert.equal(r.calls.length,2);assert.equal(r.logs.at(-1).result,'FAIL');});
test('communication errors do not expose exception messages',async()=>{const r=await run({communication:true});assert.equal(r.calls.length,1);assert.equal(r.logs.at(-1).result,'FAIL');});
test('invalid clock stops before screen requests',async()=>{const r=await run({badClock:true});assert.equal(r.calls.length,1);assert.equal(r.logs.at(-1).result,'FAIL');});
test('JSON parse failure stops without outputting body',async()=>{const r=await run({badJson:true});assert.equal(r.calls.length,2);assert.equal(r.logs.at(-1).result,'FAIL');});
for(const [name,mutate]of [
  ['missing list',b=>{delete b.confirmed;return b;}],
  ['bare array instead of GAS list DTO',b=>{b.confirmed=[];return b;}],
  ['wrong list count',b=>{b.confirmed.count=1;return b;}],
  ['wrong month',b=>{b.posted.target_month='2026-11';return b;}],
  ['extra reception filter',b=>{b.confirmed.location_id='HONBU';return b;}],
  ['wrong summary scope',b=>{b.summary.billing_block_id='WRONG';return b;}],
  ['bad arithmetic',b=>{b.summary.total_amount=1;return b;}]
])test(name+' fails and stops',async()=>{const r=await run({mutate});assert.equal(r.calls.length,2);assert.equal(r.logs.at(-1).result,'FAIL');});
