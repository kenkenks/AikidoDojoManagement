'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const adapterSource=fs.readFileSync('web/qr/system_context_adapter.js','utf8');
const managerSource=fs.readFileSync('web/qr/page_initialization_manager.js','utf8');
const base={ok:true,system_now:'2026-10-23 10:30:00',target_month:'2026-10',time_travel_enabled:false,timezone:'Asia/Tokyo'};

class Events {
  constructor(){this.listeners=new Map();}
  addEventListener(name,listener){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(listener);}
  removeEventListener(name,listener){this.listeners.get(name)?.delete(listener);}
  dispatchEvent(event){for(const listener of this.listeners.get(event.type)||[])listener(event);}
}
function load(existing=null){
  const events=new Events();
  const context={console,Promise,AbortController,Set,DOJO_SYSTEM_CONTEXT:existing,
    addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
  context.window=context;context.globalThis=context;vm.createContext(context);
  vm.runInContext(adapterSource,context);vm.runInContext(managerSource,context);
  return {context,events,dispatch(type,detail){events.dispatchEvent({type,detail});}};
}

test('uses an already published SystemContext without waiting',async()=>{
  const f=load(base),adapter=f.context.DOJO_SYSTEM_CONTEXT_ADAPTER.create();
  assert.equal(adapter.getState().status,'READY');
  assert.equal(await adapter.ready,base);assert.equal(adapter.getCurrent(),base);
});

test('resolves initial wait from the existing success event for Firebase and GAS alike',async()=>{
  for(const runtime of ['firebase','gas']){
    const f=load(),adapter=f.context.DOJO_SYSTEM_CONTEXT_ADAPTER.create();
    const waiting=adapter.ready;
    f.context.DOJO_SYSTEM_CONTEXT={...base,runtime};
    f.dispatch('dojo-system-context',{...base,runtime});
    assert.equal((await waiting).runtime,runtime);
    assert.equal(adapter.getState().status,'READY');
  }
});

test('rejects initial acquisition errors distinctly from successful context',async()=>{
  const f=load(),adapter=f.context.DOJO_SYSTEM_CONTEXT_ADAPTER.create();
  f.dispatch('dojo-system-context-error',{message:'network failed'});
  await assert.rejects(adapter.ready,error=>error.code==='SYSTEM_CONTEXT_UNAVAILABLE'&&/network failed/.test(error.message));
  assert.equal(adapter.getState().status,'ERROR');assert.equal(adapter.getCurrent(),null);
});

test('detects TimeTrip context changes and preserves same-context notifications',async()=>{
  const f=load(base),adapter=f.context.DOJO_SYSTEM_CONTEXT_ADAPTER.create(),states=[];
  adapter.subscribe(state=>states.push({status:state.status,revision:state.revision,changed:state.changed}));
  f.dispatch('dojo-system-context',base);
  const changed={...base,system_now:'2026-11-01 09:00:00',target_month:'2026-11',time_travel_enabled:true};
  f.context.DOJO_SYSTEM_CONTEXT=changed;f.dispatch('dojo-system-context',changed);
  assert.equal(adapter.getCurrent(),changed);
  assert.equal(states.at(-2).changed,false);assert.equal(states.at(-1).changed,true);
  assert.ok(states.at(-1).revision>states[0].revision);
});

test('recovers from an error when a later context event arrives',async()=>{
  const f=load(),adapter=f.context.DOJO_SYSTEM_CONTEXT_ADAPTER.create();
  const initial=adapter.ready;f.dispatch('dojo-system-context-error',{message:'first failed'});await assert.rejects(initial);
  const retry=adapter.waitForReady();f.context.DOJO_SYSTEM_CONTEXT=base;f.dispatch('dojo-system-context',base);
  assert.equal(await retry,base);assert.equal(adapter.getState().status,'READY');
});

test('provides a PageInitializationManager dependency without coupling implementations',async()=>{
  const f=load(),adapter=f.context.DOJO_SYSTEM_CONTEXT_ADAPTER.create();
  const manager=f.context.DOJO_PAGE_INITIALIZATION_MANAGER.create({
    dependencies:[adapter.dependency()],
    requiredTasks:[{name:'screen',capability:'screen',run:ctx=>ctx.values.systemContext.system_now}]
  });
  const started=manager.start();f.context.DOJO_SYSTEM_CONTEXT=base;f.dispatch('dojo-system-context',base);await started;
  assert.equal(manager.getState().status,'READY');
  assert.equal(manager.getState().values.screen,base.system_now);
  assert.equal(manager.getState().capabilities.screen,true);
});

test('manager invalidation aborts only the client wait and allows a later retry',async()=>{
  const f=load(),adapter=f.context.DOJO_SYSTEM_CONTEXT_ADAPTER.create();
  const manager=f.context.DOJO_PAGE_INITIALIZATION_MANAGER.create({dependencies:[adapter.dependency()]});
  const first=manager.start();manager.invalidate('time_changed');await first;
  assert.equal(manager.getState().status,'INVALIDATED');
  const retried=manager.start();f.context.DOJO_SYSTEM_CONTEXT=base;f.dispatch('dojo-system-context',base);await retried;
  assert.equal(manager.getState().status,'READY');
});

test('dispose removes event listeners and rejects pending waits',async()=>{
  const f=load(),adapter=f.context.DOJO_SYSTEM_CONTEXT_ADAPTER.create(),pending=adapter.ready;
  adapter.dispose();await assert.rejects(pending,error=>error.code==='SYSTEM_CONTEXT_ADAPTER_DISPOSED');
  f.dispatch('dojo-system-context',base);assert.equal(adapter.getState().status,'DISPOSED');
  await assert.rejects(adapter.waitForReady(),error=>error.code==='SYSTEM_CONTEXT_ADAPTER_DISPOSED');
});
