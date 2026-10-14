'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {createDojoPrincipalResolver,canAccessMember} = require('../cloud/api/dojo-principal.cjs');
test('verified uid is looked up server-side, not inferred from token claims or QR params', async () => {
  const seen=[];
  const resolve=createDojoPrincipalResolver({findAccountByUid:async uid=>{seen.push(uid);return {uid,disabled:false,member_id:'M001',teacher_id:'T001'};}});
  const p=await resolve({uid:'uid_1',member_id:'ATTACK',teacher_id:'ATTACK',admin:true});
  assert.deepEqual(seen,['uid_1']);
  assert.deepEqual(p,{uid:'uid_1',member_id:'M001',teacher_id:'T001'});
  assert.equal(canAccessMember(p,'M001'),true);
  assert.equal(canAccessMember(p,'M002'),false);
});
test('missing, disabled, malformed and mismatched accounts fail closed', async () => {
  const cases=[null,{}, {uid:'other',disabled:false,member_id:'M001'}, {uid:'uid_1',member_id:'M001'}, {uid:'uid_1',disabled:true,member_id:'M001'}, {uid:'uid_1',disabled:false,member_id:'../../bad'}, {uid:'uid_1',disabled:false,member_id:'M001',teacher_id:'bad/path'}, {uid:'uid_1',disabled:false}];
  for(const account of cases) assert.equal(await createDojoPrincipalResolver({findAccountByUid:async()=>account})({uid:'uid_1'}),null);
});
test('missing verified identity and lookup errors fail closed',async()=>{
  let called=0;
  const resolve=createDojoPrincipalResolver({findAccountByUid:async()=>{called++;throw Error('offline');}});
  assert.equal(await resolve({uid:''}),null);
  assert.equal(await resolve(null),null);
  assert.equal(called,0);
  assert.equal(await resolve({uid:'uid_1'}),null);
});
test('member scope cannot be widened by teacher or admin fields',async()=>{
  const resolve=createDojoPrincipalResolver({findAccountByUid:async uid=>({uid,disabled:false,teacher_id:'T001'})});
  const p=await resolve({uid:'uid_1',admin:true});
  assert.equal(canAccessMember(p,'M001'),false);
  assert.equal(p.member_id,null);
});
