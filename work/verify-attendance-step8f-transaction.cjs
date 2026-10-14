'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createFirestoreDojoAccountLifecycle, createDojoAccountTransactionRepository} = require('../cloud/api/dojo-account-transaction.cjs');
function fakeFirestore() {
 const data = new Map();
 return {data, collection(name) {return {doc(id) {return {key: `${name}/${id}`};}};},
 async runTransaction(fn) {
  const working = new Map(data), calls = [];
  const tx = {
   async get(ref) {calls.push('get');return {exists:working.has(ref.key), data:()=>working.get(ref.key)};},
   create(ref, value) {calls.push('create');if(working.has(ref.key))throw Error('ALREADY_EXISTS');working.set(ref.key,structuredClone(value));},
   set(ref,value) {calls.push('set');working.set(ref.key,structuredClone(value));}
  };
  const result=await fn(tx);
  data.clear();for(const [k,v] of working)data.set(k,v);
  return result;
 }};
}
test('requires a Firestore transaction-capable server repository',()=>{
 assert.throws(()=>createDojoAccountTransactionRepository({}),/FIRESTORE_TRANSACTION_REQUIRED/);
});
test('provision writes both keys atomically with reads before writes',async()=>{
 const db=fakeFirestore(), lifecycle=createFirestoreDojoAccountLifecycle(db);
 await lifecycle.provision({uid:'user1',type:'member',id:'M001'});
 assert.equal(db.data.get('dojo_auth_accounts/user1').member_id,'M001');
 assert.equal(db.data.get('dojo_auth_identity_keys/member:M001').uid,'user1');
});
test('conflicts leave both collections unchanged',async()=>{
 const db=fakeFirestore(),lifecycle=createFirestoreDojoAccountLifecycle(db);
 await lifecycle.provision({uid:'user1',type:'member',id:'M001'});
 await assert.rejects(lifecycle.provision({uid:'user2',type:'member',id:'M001'}),/CONFLICT/);
 await assert.rejects(lifecycle.provision({uid:'user1',type:'member',id:'M002'}),/CONFLICT/);
 assert.equal(db.data.size,2);
});
test('disable is atomic, repeatable, and retains reverse reservation',async()=>{
 const db=fakeFirestore(),lifecycle=createFirestoreDojoAccountLifecycle(db);
 await lifecycle.provision({uid:'user1',type:'teacher',id:'T001'});
 await lifecycle.disable({uid:'user1',type:'teacher',id:'T001'});
 await lifecycle.disable({uid:'user1',type:'teacher',id:'T001'});
 assert.equal(db.data.get('dojo_auth_accounts/user1').disabled,true);
 assert.equal(db.data.get('dojo_auth_identity_keys/teacher:T001').disabled,true);
 await assert.rejects(lifecycle.provision({uid:'user2',type:'teacher',id:'T001'}),/CONFLICT/);
});
test('rejects reads after transaction writes',async()=>{
 const db=fakeFirestore(),repo=createDojoAccountTransactionRepository(db);
 await assert.rejects(repo.transaction(async tx=>{
  await tx.createUid('user1',{uid:'user1'});
  await tx.getUid('user1');
 }),/TRANSACTION_READ_AFTER_WRITE/);
 assert.equal(db.data.size,0);
});
test('rejects invalid document keys',async()=>{
 const db=fakeFirestore(),repo=createDojoAccountTransactionRepository(db);
 await assert.rejects(repo.transaction(tx=>tx.getIdentity('member:../bad')),/INVALID_ACCOUNT_KEY/);
});
