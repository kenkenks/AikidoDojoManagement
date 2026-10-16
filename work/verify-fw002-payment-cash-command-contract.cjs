'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  validatePaymentCashAcceptInput,
  createAdminReceptionActor,
  createPaymentCashAcceptCommand,
  PAYMENT_CASH_ACCEPT_ENTITIES
}=require('../cloud/billing/payment-cash-accept-command.cjs');

function valid(){return {request_id:'cash.20261016:R_1',location_id:'L1',billing_block_id:'B1',
  reception_session_id:'S1',items:[{member_id:'M1',billing_group_id:'G1'}]};}

test('Step 10C-1 accepts exactly one member/group item and normalizes optional session',()=>{
  const dto=validatePaymentCashAcceptInput(valid());
  assert.deepEqual(dto,valid());assert.ok(Object.isFrozen(dto));assert.ok(Object.isFrozen(dto.items[0]));
  const input=valid();delete input.reception_session_id;
  assert.equal(validatePaymentCashAcceptInput(input).reception_session_id,'');
});

test('Step 10C-1 rejects empty/multiple batches and client-side money or invoice allocation',()=>{
  for(const input of [
    {...valid(),items:[]},
    {...valid(),items:[valid().items[0],{member_id:'M2',billing_group_id:'G2'}]},
    {...valid(),amount:1000},
    {...valid(),items:[{...valid().items[0],amount:1000}]},
    {...valid(),items:[{...valid().items[0],invoice_id:'I1'}]},
    {...valid(),target_month:'2026-10'}
  ]) assert.throws(()=>validatePaymentCashAcceptInput(input),/INVALID_PAYMENT_CASH_ACCEPT_PARAMS/);
});

test('Step 10C-1 rejects missing, malformed and unexpected identifiers',()=>{
  for(const mutate of [
    x=>x.request_id='',x=>x.request_id='bad id',x=>x.location_id='../L',
    x=>x.billing_block_id='',x=>x.items[0].member_id='',x=>x.items[0].billing_group_id='G 1'
  ]){const input=valid();mutate(input);assert.throws(()=>validatePaymentCashAcceptInput(input),/INVALID_PAYMENT_CASH_ACCEPT_PARAMS/);}
});

test('Step 10C-1 derives admin receptionist from verified principal and never trusts input actor',()=>{
  assert.deepEqual(createAdminReceptionActor({uid:'admin_1',admin:true,email:'ignored@example.test'}),{
    authenticated_uid:'admin_1',receptionist_type:'ADMIN',receptionist_id:'admin_1',teacher_id:''
  });
  assert.throws(()=>createAdminReceptionActor(null),/UNAUTHENTICATED/);
  assert.throws(()=>createAdminReceptionActor({uid:'member_1'}),/FORBIDDEN/);
  assert.throws(()=>validatePaymentCashAcceptInput({...valid(),teacher_id:'T1'}),/INVALID_PAYMENT_CASH_ACCEPT_PARAMS/);
});

test('Step 10C-1 command boundary validates before invoking the future atomic executor',async()=>{
  const calls=[];const command=createPaymentCashAcceptCommand({executeAtomic:async value=>{calls.push(value);return {ok:true};}});
  assert.deepEqual(await command.execute(valid(),{uid:'admin_1',admin:true}),{ok:true});
  assert.equal(calls.length,1);assert.equal(calls[0].request.items.length,1);
  assert.equal(calls[0].actor.authenticated_uid,'admin_1');
  assert.throws(()=>command.execute({...valid(),amount:1},{uid:'admin_1',admin:true}),/INVALID/);
  assert.equal(calls.length,1);
  assert.throws(()=>createPaymentCashAcceptCommand(),/ATOMIC_EXECUTOR_REQUIRED/);
});

test('Step 10C-1 entity contract includes idempotency receipt and existing projection boundary',()=>{
  assert.equal(PAYMENT_CASH_ACCEPT_ENTITIES.idempotency.collection,'payment_cash_requests');
  assert.equal(PAYMENT_CASH_ACCEPT_ENTITIES.idempotency.document_id,'request_id');
  for(const name of ['payments','paymentEvidences','invoices','payment_cash_requests'])
    assert.ok(PAYMENT_CASH_ACCEPT_ENTITIES.writes.includes(name));
  assert.match(PAYMENT_CASH_ACCEPT_ENTITIES.projection.responsibility,/existing payment allocation/);
});
