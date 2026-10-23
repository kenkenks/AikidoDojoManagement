'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('web/qr/page_initialization_manager.js','utf8');
function load(){const context={console,Promise,AbortController,Set,URL};context.window=context;context.globalThis=context;vm.createContext(context);vm.runInContext(source,context);return context.DOJO_PAGE_INITIALIZATION_MANAGER;}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function flush(){return new Promise(resolve=>setImmediate(resolve));}

test('waits for authentication and context regardless of their arrival order',async()=>{
  for(const order of [['auth','context'],['context','auth']]){
    const pending={auth:deferred(),context:deferred()},calls=[];
    const manager=load().create({
      dependencies:[{name:'auth',run:()=>pending.auth.promise},{name:'context',run:()=>pending.context.promise}],
      requiredTasks:[{name:'page',capability:'business',run:ctx=>{calls.push({...ctx.values});return 'ready';}}]
    });
    const started=manager.start();
    pending[order[0]].resolve(order[0]);await flush();
    assert.equal(calls.length,0);
    pending[order[1]].resolve(order[1]);await started;
    assert.equal(manager.getState().status,'READY');
    assert.equal(manager.getState().capabilities.business,true);
  }
});

test('deduplicates start while initialization is running',async()=>{
  const wait=deferred();let count=0;
  const manager=load().create({dependencies:[{name:'auth',run:()=>{count++;return wait.promise;}}]});
  const first=manager.start(),second=manager.start();
  assert.equal(first,second);assert.equal(count,1);
  wait.resolve(true);await first;
  assert.equal(manager.start() instanceof Promise,true);assert.equal(count,1);
});

test('retry aborts the old generation and starts a fresh generation',async()=>{
  const waits=[deferred(),deferred()];let index=0,firstSignal;
  const manager=load().create({dependencies:[{name:'auth',run:ctx=>{if(index===0)firstSignal=ctx.signal;return waits[index++].promise;}}]});
  const first=manager.start();const retried=manager.retry('again');
  assert.equal(firstSignal.aborted,true);
  waits[1].resolve('new');await retried;
  waits[0].resolve('old');await first;
  assert.equal(manager.getState().status,'READY');assert.equal(manager.getState().values.auth,'new');
});

test('invalidate makes old responses and direct DOM guards stale',async()=>{
  const wait=deferred();let guard;
  const manager=load().create({dependencies:[{name:'auth',run:ctx=>{guard=ctx.isCurrent;return wait.promise;}}]});
  const started=manager.start();assert.equal(guard(),true);
  manager.invalidate('context_changed');assert.equal(guard(),false);
  wait.resolve('late');await started;
  assert.equal(manager.getState().status,'INVALIDATED');assert.deepEqual({...manager.getState().capabilities},{});
});

test('access loss stops operations synchronously without deciding input disposal',async()=>{
  const wait=deferred(),events=[];
  const manager=load().create({dependencies:[{name:'permission',run:()=>wait.promise}],stopOperations:reason=>events.push(reason)});
  const started=manager.start();manager.accessLost('permission_lost');
  assert.deepEqual(events,['permission_lost']);assert.equal(manager.getState().status,'INVALIDATED');
  assert.equal(Object.hasOwn(manager.getState(),'input'),false);
  wait.resolve(true);await started;
});

test('required failure blocks READY while optional failure only removes its capability',async()=>{
  const required=load().create({requiredTasks:[{name:'business',capability:'business',run:async()=>{throw Error('required');}}]});
  await assert.rejects(required.start(),/required/);assert.equal(required.getState().status,'ERROR');
  const optional=load().create({
    requiredTasks:[{name:'business',capability:'business',run:async()=>true}],
    optionalTasks:[{name:'rankMaster',capability:'rank',run:async()=>{throw Error('optional');}}]
  });
  await optional.start();
  assert.equal(optional.getState().status,'READY');
  assert.deepEqual({...optional.getState().capabilities},{business:true,rank:false});
  assert.match(optional.getState().optionalErrors.rankMaster.message,/optional/);
});

test('stale optional response cannot overwrite READY or capabilities after retry',async()=>{
  const old=deferred();let calls=0;
  const manager=load().create({optionalTasks:[{name:'help',capability:'help',run:()=>calls++===0?old.promise:Promise.resolve('new')}]});
  const first=manager.start();const second=manager.retry();await second;
  assert.equal(manager.getState().capabilities.help,true);assert.equal(manager.getState().values.help,'new');
  old.reject(Error('old failed'));await first;
  assert.equal(manager.getState().status,'READY');assert.equal(manager.getState().capabilities.help,true);
});

test('dispose aborts work, stops synchronously and rejects future starts',async()=>{
  const wait=deferred(),events=[];
  const manager=load().create({dependencies:[{name:'auth',run:()=>wait.promise}],stopOperations:reason=>events.push(reason)});
  const started=manager.start();manager.dispose();
  assert.equal(manager.getState().status,'DISPOSED');assert.deepEqual(events,['disposed']);
  await assert.rejects(manager.start(),error=>error.code==='INITIALIZATION_MANAGER_DISPOSED');
  wait.resolve(true);await started;assert.equal(manager.getState().status,'DISPOSED');
});

test('validates injected contracts without importing business dependencies',()=>{
  const api=load();
  assert.throws(()=>api.create({dependencies:[{name:'auth'}]}),/run is required/);
  assert.throws(()=>api.create({requiredTasks:[{name:'x',run(){}},{name:'x',run(){}}]}),/unique/);
});
