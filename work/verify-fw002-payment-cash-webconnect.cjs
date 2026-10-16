'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDispatch}=require('../cloud/api/webConnect.cjs');
const {createAdminApi}=require('../cloud/api/admin-api.cjs');
const {createPaymentCashAcceptCommand}=require('../cloud/billing/payment-cash-accept-command.cjs');

const valid=(id='R1')=>({request_id:id,location_id:'L1',billing_block_id:'B1',reception_session_id:'S1',items:[{member_id:'M1',billing_group_id:'G1'}]});
function api(executeAtomic,{badResult=false}={}){
  const command=createPaymentCashAcceptCommand({executeAtomic});
  return createDispatch(createAdminApi({
    verifyIdToken:async token=>{if(token==='invalid')throw Error();return {uid:token,admin:token==='admin'};},
    getTimeTravel:async()=>({}),saveTimeTravel:async()=>({}),getSystemContext:async()=>({ok:true}),
    readMember:async()=>null,readMembers:async()=>[],readBillingMemberInfo:async id=>({ok:true,memberId:id}),
    acceptCashPayment:badResult?async()=>({ok:false,message:'must not escape'}):(input,user)=>command.execute(input,user)
  }));
}
const call=(dispatch,{method='POST',input=valid(),token='admin'}={})=>dispatch({action:'payment_cash_accept',input,method,
  context:{authorization:token===null?undefined:'Bearer '+token}});

test('Step 10C-3 resolves payment_cash_accept and accepts verified admin POST',async()=>{
  const calls=[],dispatch=api(async command=>{calls.push(command);return {ok:true,request_id:command.request.request_id};});
  const result=await call(dispatch,{});assert.equal(result.status,200);assert.equal(result.body.ok,true);
  assert.equal(calls.length,1);assert.equal(calls[0].actor.authenticated_uid,'admin');
});

test('Step 10C-3 rejects GET, missing/invalid token and non-admin before Command execution',async()=>{
  let writes=0;const dispatch=api(async()=>{writes++;return {ok:true};});
  assert.equal((await call(dispatch,{method:'GET'})).status,405);
  assert.equal((await call(dispatch,{token:null})).status,401);
  assert.equal((await call(dispatch,{token:'invalid'})).status,401);
  assert.equal((await call(dispatch,{token:'teacher'})).status,403);
  assert.equal(writes,0);
});

test('Step 10C-3 reuses Step 10C-1 validation and returns 400 without executor call',async()=>{
  let writes=0;const dispatch=api(async()=>{writes++;return {ok:true};});
  const input={...valid(),amount:1000};const result=await call(dispatch,{input});
  assert.equal(result.status,400);assert.deepEqual(result.body,{error:'INVALID_PAYMENT_CASH_ACCEPT_PARAMS'});assert.equal(writes,0);
});

test('Step 10C-3 maps idempotent replay and changed-input conflict without ok:true on failure',async()=>{
  const seen=new Map();const dispatch=api(async command=>{
    const id=command.request.request_id,key=JSON.stringify(command.request);
    if(seen.has(id)&&seen.get(id)!==key)throw Object.assign(Error('PAYMENT_CASH_REQUEST_CONFLICT'),{code:'PAYMENT_CASH_REQUEST_CONFLICT',status:409});
    const replay=seen.has(id);seen.set(id,key);return {ok:true,request_id:id,idempotent_replay:replay};
  });
  assert.equal((await call(dispatch,{})).body.idempotent_replay,false);
  assert.equal((await call(dispatch,{})).body.idempotent_replay,true);
  const changed=valid();changed.reception_session_id='S2';const conflict=await call(dispatch,{input:changed});
  assert.equal(conflict.status,409);assert.equal(conflict.body.ok,undefined);assert.equal(conflict.body.error,'PAYMENT_CASH_REQUEST_CONFLICT');
});

test('Step 10C-3 hides unexpected failures and rejects false success DTO',async()=>{
  const unavailable=api(async()=>{throw Error('database detail should not escape');});
  const failed=await call(unavailable,{});assert.equal(failed.status,503);
  assert.deepEqual(failed.body,{error:'PAYMENT_CASH_ACCEPT_UNAVAILABLE'});
  const falseDto=await call(api(async()=>({ok:true}),{badResult:true}),{});
  assert.equal(falseDto.status,500);assert.deepEqual(falseDto.body,{error:'PAYMENT_CASH_ACCEPT_FAILED'});
});

test('Step 10C-3 leaves existing authenticated GET actions unchanged',async()=>{
  const dispatch=api(async()=>({ok:true}));
  const result=await dispatch({action:'getMemberInfo',input:{member_id:'M1'},method:'GET',context:{authorization:'Bearer admin'}});
  assert.equal(result.status,200);assert.equal(result.body.memberId,'M1');
});
