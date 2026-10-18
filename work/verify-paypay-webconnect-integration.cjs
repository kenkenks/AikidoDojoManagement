'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDispatch } = require('../cloud/api/webConnect.cjs');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
const { validatePayPayPostSelected } = require('../cloud/billing/payment-paypay-command.cjs');

const valid = (request_id='DEMO_001') => ({
  request_id, location_id:'L1', billing_block_id:'B1',
  reception_session_id:'S1', evidence_items:[{evidence_id:'E1'}]
});
function makeApi({enabled=true, executor=async()=>({ok:true}), reads={}}={}) {
  const calls=[];
  const dispatch=createDispatch(createAdminApi({
    verifyIdToken:async token=>{
      if(token==='invalid')throw Error('bad token');
      return {uid:token,admin:token==='admin'};
    },
    getSystemContext:async()=>({}),getTimeTravel:async()=>({}),saveTimeTravel:async()=>({}),
    readMember:async()=>null,readMembers:async()=>[],
    readBillingMemberInfo:async member_id=>({ok:true,memberId:member_id}),
    acceptCashPayment:async()=>({ok:true}),
    ...reads,
    postPayPayPayment:enabled ? async(input,user)=>{
      const request=validatePayPayPostSelected(input);
      calls.push({request,user});
      return executor(request,user);
    }:null,
    startPayPayCode:enabled ? async(input)=>({ok:true,memberId:input.member_id}) : null,
    recordPayPayCode:enabled ? async(input)=>({ok:true,evidenceCode:input.evidence_code}) : null
  }));
  return {dispatch,calls};
}
const call=(dispatch,{action='payment_paypay_post_selected',method='POST',input=valid(),token='admin'}={})=>
  dispatch({action,input,method,context:{authorization:token===null?undefined:`Bearer ${token}`}});

test('PayPay action resolves through WebConnect and reaches authenticated Command',async()=>{
  const {dispatch,calls}=makeApi();
  const result=await call(dispatch,{});
  assert.equal(result.status,200);
  assert.equal(result.body.ok,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].user.uid,'admin');
  assert.equal(calls[0].request.evidence_items[0].evidence_id,'E1');
});
test('GET is rejected before authentication or execution',async()=>{
  const {dispatch,calls}=makeApi();
  assert.equal((await call(dispatch,{method:'GET',token:null})).status,405);
  assert.equal(calls.length,0);
});
test('missing or invalid token is rejected',async()=>{
  const {dispatch,calls}=makeApi();
  assert.equal((await call(dispatch,{token:null})).status,401);
  assert.equal((await call(dispatch,{token:'invalid'})).status,401);
  assert.equal(calls.length,0);
});
test('non-admin cannot post PayPay',async()=>{
  const {dispatch,calls}=makeApi();
  assert.equal((await call(dispatch,{token:'teacher'})).status,403);
  assert.equal(calls.length,0);
});
test('DEV-disabled handler rejects before write',async()=>{
  const {dispatch,calls}=makeApi({enabled:false});
  assert.deepEqual((await call(dispatch,{})).body,{error:'PAYPAY_POST_DEV_ONLY'});
  assert.equal(calls.length,0);
});
test('invalid Command input returns 400 without executing',async()=>{
  const {dispatch,calls}=makeApi();
  const result=await call(dispatch,{input:{...valid(),evidence_items:[{evidence_id:'E1'},{evidence_id:'E1'}]}});
  assert.equal(result.status,400);
  assert.equal(result.body.error,'INVALID_PAYPAY_POST_SELECTED');
  assert.equal(calls.length,0);
});
test('business conflict maps to 409 without leaking details',async()=>{
  const {dispatch}=makeApi({executor:async()=>{throw Object.assign(Error('private detail'),{code:'PAYPAY_REQUEST_CONFLICT',status:409});}});
  const result=await call(dispatch,{});
  assert.equal(result.status,409);
  assert.deepEqual(result.body,{error:'PAYPAY_REQUEST_CONFLICT'});
});
test('unexpected executor failure is sanitized',async()=>{
  const {dispatch}=makeApi({executor:async()=>{throw Error('database secret');}});
  const result=await call(dispatch,{});
  assert.equal(result.status,503);
  assert.deepEqual(result.body,{error:'PAYPAY_POST_UNAVAILABLE'});
});
test('existing cash POST and billing GET routing remain intact',async()=>{
  const {dispatch}=makeApi();
  const cash=await call(dispatch,{action:'payment_cash_accept',input:{},method:'POST'});
  assert.equal(cash.status,200);
  const member=await call(dispatch,{action:'getMemberInfo',input:{member_id:'M1'},method:'GET'});
  assert.equal(member.status,200);
  assert.equal(member.body.memberId,'M1');
});
test('member PayPay start and record use authenticated POST WebConnect actions',async()=>{
  const {dispatch}=makeApi();
  const start=await call(dispatch,{action:'paypay_code_start',input:{request_id:'S1',member_id:'M1'},method:'POST'});
  assert.equal(start.status,200);assert.equal(start.body.memberId,'M1');
  const record=await call(dispatch,{action:'paypay_code_record',input:{request_id:'R1',member_id:'M1',evidence_code:'M1-20261018-1500',evidence_items:[{evidence_id:'E1'}]},method:'POST'});
  assert.equal(record.status,200);assert.equal(record.body.evidenceCode,'M1-20261018-1500');
  assert.equal((await call(dispatch,{action:'paypay_code_start',method:'GET',token:null})).status,405);
  assert.equal((await call(dispatch,{action:'paypay_code_record',method:'POST',token:'teacher',input:{}})).status,403);
});
