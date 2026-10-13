'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {applyExistingUpdates} = require('./gas2firebase-copy.cjs');
const docs = [{id:'M001',fields:{member_id:'M001',email:'correct',insurance_type:''}}];
const existing = [{email:'old',insurance_type:'wrong'}];
function fakeCore({stale=false, failWrite=false, failReadback=false}={}) {
  const state = {...existing[0]};
  const calls=[];
  return {calls,
    async readByIdWithMetadata(){return {fields:stale ? {...state, unexpected:'change'} : {...state},updateTime:'2026-10-13T01:00:00Z'};},
    async updateByKey(_target,_id,values,options){calls.push({values,options});if(failWrite)throw Error('FIRESTORE_HTTP_412');Object.assign(state,values);},
    async readById(){return failReadback ? {...state,email:'bad'} : {...state};}
  };
}
test('atomic precondition and only changed fields; no PII in summary',async()=>{
 const core=fakeCore();const result=await applyExistingUpdates(docs,existing,core,{collection:'members'},{confirm:'dojo-management-dev'});
 assert.equal(result.ok,true);assert.equal(result.writes,1);assert.equal(result.verified,1);
 assert.deepEqual(core.calls[0].values,docs[0].fields);
 assert.equal(core.calls[0].options.updateTime,'2026-10-13T01:00:00Z');
 assert.equal(JSON.stringify(result).includes('correct'),false);
});
test('refuse missing confirmation',async()=>{
 await assert.rejects(()=>applyExistingUpdates(docs,existing,fakeCore(),{collection:'members'}),/UPDATE_CONFIRMATION_REQUIRED/);
});
test('stale preflight blocks before write',async()=>{
 const core=fakeCore({stale:true});const result=await applyExistingUpdates(docs,existing,core,{collection:'members'},{confirm:'dojo-management-dev'});
 assert.equal(result.ok,false);assert.equal(result.writes,0);assert.equal(core.calls.length,0);
});
test('HTTP precondition failure stops without claiming write',async()=>{
 const core=fakeCore({failWrite:true});const result=await applyExistingUpdates(docs,existing,core,{collection:'members'},{confirm:'dojo-management-dev'});
 assert.equal(result.ok,false);assert.equal(result.writes,0);assert.equal(result.first_error,'FIRESTORE_HTTP_412');
});
test('readback mismatch records write and fails',async()=>{
 const core=fakeCore({failReadback:true});const result=await applyExistingUpdates(docs,existing,core,{collection:'members'},{confirm:'dojo-management-dev'});
 assert.equal(result.ok,false);assert.equal(result.writes,1);assert.equal(result.first_error,'UPDATE_READ_BACK_MISMATCH');
});
test('extra Firestore field blocks entire plan',async()=>{
 await assert.rejects(()=>applyExistingUpdates(docs,[{...existing[0],extra:'x'}],fakeCore(),{collection:'members'},{confirm:'dojo-management-dev'}),/UPDATE_PLAN_BLOCKED/);
});
