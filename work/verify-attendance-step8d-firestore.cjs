'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createDojoAccountFirestoreLookup,createFirestoreDojoPrincipalResolver} = require('../cloud/api/dojo-account-firestore.cjs');
const {canAccessMember} = require('../cloud/api/dojo-principal.cjs');
test('bounded server-side UID document lookup and verified principal',async()=>{
 const calls=[];const core={readById:async(source,id)=>{calls.push([source.collection,id]);return {uid:id,disabled:false,member_id:'M001'};}};
 const resolve=createFirestoreDojoPrincipalResolver(core);
 const p=await resolve({uid:'authUID_1',member_id:'M999'});
 assert.deepEqual(calls,[['dojo_auth_accounts','authUID_1']]);
 assert.equal(p.member_id,'M001');assert.equal(canAccessMember(p,'M999'),false);
 assert.equal(canAccessMember(p,'M001'),true);
});
test('reject invalid UID before storage access',async()=>{
 let calls=0;const lookup=createDojoAccountFirestoreLookup({readById:async()=>{calls++;return {};}});
 for(const uid of ['', '../members/M001','a/b','a b',null])assert.equal(await lookup(uid),null);
 assert.equal(calls,0);
});
test('reject mismatched UID, disabled, missing and malformed accounts',async()=>{
 for(const account of [null,[],{uid:'other',disabled:false,member_id:'M001'},
 {uid:'uid1',disabled:true,member_id:'M001'},
 {uid:'uid1',member_id:'M001'},
 {uid:'uid1',disabled:false,member_id:'../bad'}]){
  const resolve=createFirestoreDojoPrincipalResolver({readById:async()=>account});
  assert.equal(await resolve({uid:'uid1'}),null);
 }
});
test('read failures fail closed; no account writes or new HTTP routes',async()=>{
 const resolve=createFirestoreDojoPrincipalResolver({readById:async()=>{throw Error('offline');}});
 assert.equal(await resolve({uid:'uid1'}),null);
});
