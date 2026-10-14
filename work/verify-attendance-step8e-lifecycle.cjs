'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDojoAccountLifecycle}=require('../cloud/api/dojo-account-lifecycle.cjs');
function fakeRepo() {
 const u=new Map(), i=new Map();
 return {u,i,async transaction(fn){
  const uc=new Map(u),ic=new Map(i);
  const tx={getUid:async k=>uc.get(k),getIdentity:async k=>ic.get(k),
   createUid:async(k,v)=>{if(uc.has(k))throw Error('EXISTS');uc.set(k,v);},
   createIdentity:async(k,v)=>{if(ic.has(k))throw Error('EXISTS');ic.set(k,v);},
   setUid:async(k,v)=>uc.set(k,v),setIdentity:async(k,v)=>ic.set(k,v)};
  const result=await fn(tx);u.clear();i.clear();for(const [k,v] of uc)u.set(k,v);
  for(const [k,v] of ic)i.set(k,v);return result;
 }};
}
test('requires explicit atomic repository',()=>{
 assert.throws(()=>createDojoAccountLifecycle({}),/ATOMIC_TRANSACTION_REQUIRED/);
});
test('provision stores UID and reserved reverse identity',async()=>{
 const r=fakeRepo(),svc=createDojoAccountLifecycle(r);
 assert.deepEqual(await svc.provision({uid:'uid1',type:'member',id:'M001'}),{uid:'uid1',type:'member',id:'M001'});
 assert.equal(r.u.get('uid1').member_id,'M001');assert.equal(r.i.get('member:M001').uid,'uid1');
});
test('duplicate UID or identity is rejected; no partial write',async()=>{
 const r=fakeRepo(),svc=createDojoAccountLifecycle(r);
 await svc.provision({uid:'uid1',type:'member',id:'M001'});
 await assert.rejects(svc.provision({uid:'uid2',type:'member',id:'M001'}),/CONFLICT/);
 await assert.rejects(svc.provision({uid:'uid1',type:'member',id:'M002'}),/CONFLICT/);
 assert.equal(r.u.size,1);assert.equal(r.i.size,1);
});
test('disable is fail-closed, idempotent, and preserves reserved identity',async()=>{
 const r=fakeRepo(),svc=createDojoAccountLifecycle(r);
 await svc.provision({uid:'uid1',type:'teacher',id:'T001'});
 await assert.rejects(svc.disable({uid:'uid1',type:'teacher',id:'T002'}),/MISMATCH/);
 assert.deepEqual(await svc.disable({uid:'uid1',type:'teacher',id:'T001'}),{disabled:true});
 assert.deepEqual(await svc.disable({uid:'uid1',type:'teacher',id:'T001'}),{disabled:true});
 assert.equal(r.u.get('uid1').disabled,true);
 await assert.rejects(svc.provision({uid:'uid2',type:'teacher',id:'T001'}),/CONFLICT/);
});
test('rejects malformed identity before any repository calls',async()=>{
 let count=0;const svc=createDojoAccountLifecycle({transaction:async()=>{count++;}});
 for(const v of [{uid:'a/b',type:'member',id:'M1'}, {uid:'u1',type:'admin',id:'M1'},
  {uid:'u1',type:'member',id:'../M1'}]) await assert.rejects(svc.provision(v),/INVALID/);
 assert.equal(count,0);
});
