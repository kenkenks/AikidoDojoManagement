'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require.resolve('../web/qr/system_context.js'), 'utf8');
function fixture(runtime, fetchImpl) {
  const events=[];const inserted=[];const scripts=[];
  const window={DOJO_RUNTIME_CONFIG:{runtime,apiBaseUrl:'https://example.test/'},setTimeout:()=>1,clearTimeout:()=>{},dispatchEvent:e=>events.push(e),Date};
  const document={body:{firstChild:null,insertBefore:e=>inserted.push(e)},head:{appendChild:e=>{e.parentNode={removeChild:()=>{}};scripts.push(e);}},createElement:tag=>({tagName:tag})};
  const context={window,document,fetch:fetchImpl,CustomEvent:class {constructor(type,init){this.type=type;this.detail=init.detail;}},URLSearchParams,Date,Math,AbortController};
  vm.runInNewContext(code,context);
  return {window,events,inserted,scripts};
}
const data={ok:true,system_now:'2026-10-11 18:00:00',target_month:'2026-10',time_travel_enabled:false};
test('Firebase runtime fetches public clock without token or JSONP',async()=>{
  let url,options;
  const f=fixture('firebase',async(u,o)=>{url=u;options=o;return {ok:true,json:async()=>data};});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(url,'https://example.test/api/system/context');
  assert.equal(options.method,'GET');
  assert.equal(options.cache,'no-store');
  assert.equal(f.scripts.length,0);
  assert.equal(f.events[0].type,'dojo-system-context');
  assert.equal(f.inserted.length,1);
});
test('GAS runtime preserves JSONP callback and banner',()=>{
  const f=fixture('gas');
  assert.equal(f.scripts.length,1);
  const url=new URL(f.scripts[0].src);
  assert.equal(url.searchParams.get('action'),'system_context');
  f.window[url.searchParams.get('callback')](data);
  assert.equal(f.events[0].type,'dojo-system-context');
  assert.equal(f.inserted.length,1);
});
test('Firebase network errors dispatch existing error event',async()=>{
  const f=fixture('firebase',async()=>{throw Error('offline');});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.events[0].type,'dojo-system-context-error');
});
