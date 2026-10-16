'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

function load(){
  const file=path.resolve(__dirname,'../web/qr/payment_cash_accept_client.js');
  delete require.cache[file];delete global.DOJO_PAYMENT_CASH_ACCEPT;require(file);
  return global.DOJO_PAYMENT_CASH_ACCEPT;
}
const input=()=>({location_id:'L1',billing_block_id:'B1',reception_session_id:'S1',items:[{member_id:'M1',billing_group_id:'G1'}]});

test('cash UI client generates request before send and clears it after success',async()=>{
  const sent=[],client=load().create({generateRequestId:()=> 'RID-1',send:async request=>{sent.push(request);return {ok:true,request_id:request.request_id,accepted_amount:1000};}});
  const result=await client.execute(input());
  assert.equal(result.request_id,'RID-1');assert.equal(sent[0].request_id,'RID-1');assert.equal(client.getPendingRequest(),null);
});

test('unknown transport result retains the exact request ID and payload for retry',async()=>{
  const sent=[];let fail=true;
  const client=load().create({generateRequestId:()=> 'RID-UNKNOWN',send:async request=>{
    sent.push(request);if(fail){fail=false;throw Object.assign(Error('timeout'),{outcomeUnknown:true});}
    return {ok:true,request_id:request.request_id,idempotent_replay:true};
  }});
  await assert.rejects(client.execute(input()),error=>error.outcomeUnknown===true);
  assert.equal(client.getPendingRequest().request_id,'RID-UNKNOWN');
  await client.execute({...input(),reception_session_id:'S2'});
  assert.equal(sent.length,2);assert.strictEqual(sent[0],sent[1]);assert.equal(sent[1].reception_session_id,'S1');
});

test('an unresolved receipt blocks a different member instead of reusing its request ID',async()=>{
  const client=load().create({generateRequestId:()=> 'RID-PENDING',send:async()=>{throw Object.assign(Error('timeout'),{outcomeUnknown:true});}});
  await assert.rejects(client.execute(input()));
  const other=input();other.items=[{member_id:'M2',billing_group_id:'G2'}];
  await assert.rejects(client.execute(other),error=>error.outcomeUnknown===true&&error.pending===true);
  assert.equal(client.getPendingRequest().items[0].member_id,'M1');
});

test('double submit is suppressed while the first request is pending',async()=>{
  let release;const wait=new Promise(resolve=>{release=resolve;});let sends=0;
  const client=load().create({generateRequestId:()=> 'RID-BUSY',send:async request=>{sends++;await wait;return {ok:true,request_id:request.request_id};}});
  const first=client.execute(input());const duplicate=await client.execute(input());
  assert.deepEqual(duplicate,{ok:false,duplicate_submit:true});assert.equal(sends,1);
  release();await first;assert.equal(client.isBusy(),false);
});

test('definitive HTTP failure discards the ID while malformed success remains retryable',async()=>{
  let sequence=0;
  const client=load().create({generateRequestId:()=> 'RID-'+(++sequence),send:async()=>{throw Object.assign(Error('403'),{outcomeUnknown:false});}});
  await assert.rejects(client.execute(input()),/403/);assert.equal(client.getPendingRequest(),null);
  await assert.rejects(client.execute(input()),/403/);assert.equal(sequence,2);
  const malformed=load().create({generateRequestId:()=> 'RID-MALFORMED',send:async()=>({ok:true})});
  await assert.rejects(malformed.execute(input()),error=>error.outcomeUnknown===true);
  assert.equal(malformed.getPendingRequest().request_id,'RID-MALFORMED');
});
