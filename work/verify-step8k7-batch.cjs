'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {copy, parseArgs, applyExistingUpdates} = require('./gas2firebase-copy.cjs');
const schema = {collection:'members',fields:[{logicalName:'member_id',physicalName:'member_id',documentId:true,type:'string'}]};
const docs=[{id:'M001',fields:{member_id:'M001'}},{id:'M002',fields:{member_id:'M002'}},{id:'M003',fields:{member_id:'M003'}}];
const existing=[{member_id:'M001'},{},{}];
function core({failAt}={}) {
 const state=new Map(docs.map((d,i)=>[d.id,{...existing[i]}])); const calls=[];
 return {calls,
  async readByIdWithMetadata(_t,id){return {fields:{...state.get(id)},updateTime:'2026-10-13T01:00:00Z'};},
  async updateByKey(_t,id,values,opts){calls.push({id,values,opts});if(id===failAt)throw Error('FIRESTORE_HTTP_412');Object.assign(state.get(id),values);},
  async readById(_t,id){return {...state.get(id)};}
 };
}
test('batch updates only differences and skips already verified',async()=>{
 const c=core(); const r=await applyExistingUpdates(docs,existing,c,{collection:'members'},{confirm:'dojo-management-dev'});
 assert.equal(r.ok,true);assert.equal(r.writes,2);assert.equal(r.updated,2);assert.deepEqual(c.calls.map(x=>x.id),['M002','M003']);
 assert.ok(c.calls.every(x=>x.opts.updateTime));
});
test('batch stops at first failed update',async()=>{
 const c=core({failAt:'M002'});const r=await applyExistingUpdates(docs,existing,c,{collection:'members'},{confirm:'dojo-management-dev'});
 assert.equal(r.ok,false);assert.equal(r.writes,0);assert.equal(r.failed_id,'M002');assert.deepEqual(c.calls.map(x=>x.id),['M002']);
});
test('batch mode requires Member and forbids only-id',async()=>{
 await assert.rejects(copy({table:'Teacher',applyAllUpdates:true,records:[],schema}),/UPDATE_ALL_MODE_INVALID/);
 await assert.rejects(copy({table:'Member',applyAllUpdates:true,onlyId:'M001',records:[],schema}),/UPDATE_ALL_MODE_INVALID/);
});
test('batch mode requires confirmation before Firestore reads',async()=>{
 await assert.rejects(copy({table:'Member',applyAllUpdates:true,records:[],schema}),/COPY_EXECUTE_CONFIRMATION_REQUIRED/);
});
test('CLI rejects unknown flags and duplicate flags',()=>{
 assert.throws(()=>parseArgs(['--apply-all-updates-typo']),/COPY_UNKNOWN_OPTION/);
 assert.throws(()=>parseArgs(['--table','Member','--table','Member']),/COPY_DUPLICATE_OPTION/);
 assert.throws(()=>parseArgs(['--confirm']),/COPY_OPTION_VALUE_REQUIRED/);
});
test('CLI recognizes explicit batch mode',()=>{
 const p=parseArgs(['--table','Member','--apply-all-updates','--confirm','dojo-management-dev']);
 assert.equal(p.applyAllUpdates,true);assert.equal(p.confirm,'dojo-management-dev');
});
