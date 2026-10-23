'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('web/qr/auth_gate.js','utf8');

function load(){
  const context={URL};
  context.window=context;
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(source,context);
  return context.DOJO_AUTH_GATE;
}

function storage(initial={}){
  const values=new Map(Object.entries(initial));
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    values
  };
}

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

function fixture({user=null,ready=Promise.resolve(),stored={}}={}){
  let currentUser=user,listener=null,unsubscribed=false;
  const redirects=[];
  const authClient={
    ready,
    getCurrentUser:()=>currentUser,
    onUserChanged:fn=>{listener=fn;return()=>{unsubscribed=true;listener=null;}},
    signInWithGoogle:async()=>({user:currentUser}),
    signOut:async()=>{currentUser=null;if(listener)listener(null);}
  };
  const location={href:'https://dojo.example/qr/attendance.html?location_id=HONBU#private',assign:url=>redirects.push(url)};
  const session=storage(stored);
  const gate=load().create({authClient,location,storage:session,loginPath:'index.html'});
  return {gate,authClient,location,session,redirects,setUser(next){currentUser=next;if(listener)listener(next);},get unsubscribed(){return unsubscribed;}};
}

test('distinguishes checking, unauthenticated and authenticated states',async()=>{
  const pending=deferred();
  const f=fixture({ready:pending.promise});
  assert.equal(f.gate.getState().status,'CHECKING');
  pending.resolve();
  await f.gate.ready;
  assert.equal(f.gate.getState().status,'UNAUTHENTICATED');
  f.setUser({uid:'U1'});
  assert.equal(f.gate.getState().status,'AUTHENTICATED');
  assert.equal((await f.gate.requireAuthenticated()).uid,'U1');
  f.setUser(null);
  await assert.rejects(f.gate.requireAuthenticated(),error=>error.code==='UNAUTHENTICATED');
});

test('reports initialization failure without treating it as unauthenticated',async()=>{
  const f=fixture({ready:Promise.reject(new Error('SDK_UNAVAILABLE'))});
  await assert.rejects(f.gate.ready,/SDK_UNAVAILABLE/);
  assert.equal(f.gate.getState().status,'ERROR');
  assert.match(f.gate.getState().error.message,/SDK_UNAVAILABLE/);
});

test('accepts only same-origin return paths below the login directory',()=>{
  const api=load();
  const options={baseUrl:'https://dojo.example/qr/index.html',loginUrl:'https://dojo.example/qr/index.html',allowedPathPrefix:'/qr/'};
  assert.equal(api.normalizeReturnUrl('/qr/attendance.html?location_id=HONBU#secret',options),'/qr/attendance.html?location_id=HONBU');
  assert.equal(api.normalizeReturnUrl('attendanceCheck.html?teacher_id=T1',options),'/qr/attendanceCheck.html?teacher_id=T1');
  for(const unsafe of ['https://evil.example/qr/attendance.html','//evil.example/x','javascript:alert(1)','/admin/x','/qr/index.html?return_url=x','https://u:p@dojo.example/qr/x']){
    assert.equal(api.normalizeReturnUrl(unsafe,options),null,unsafe);
  }
});

test('builds login URL, remembers validated return and never stores fragments',async()=>{
  const f=fixture();
  await f.gate.ready;
  const login=new URL(f.gate.buildLoginUrl());
  assert.equal(login.href,'https://dojo.example/qr/index.html?return_url=%2Fqr%2Fattendance.html%3Flocation_id%3DHONBU');
  assert.equal(f.gate.getRememberedReturnUrl(),'/qr/attendance.html?location_id=HONBU');
  assert.equal(f.gate.redirectToLogin('/qr/member_home.html?member_id=M1'),'https://dojo.example/qr/index.html?return_url=%2Fqr%2Fmember_home.html%3Fmember_id%3DM1');
  assert.equal(f.redirects.length,1);
  f.gate.clearRememberedReturnUrl();
  assert.equal(f.gate.getRememberedReturnUrl(),null);
});

test('ignores unavailable sessionStorage and cleans invalid stored return values',async()=>{
  const broken={getItem(){throw Error('denied')},setItem(){throw Error('denied')},removeItem(){throw Error('denied')}};
  const f=fixture();
  const gate=load().create({authClient:f.authClient,location:f.location,storage:broken,loginPath:'index.html'});
  await gate.ready;
  assert.match(gate.buildLoginUrl(),/^https:\/\/dojo\.example\/qr\/index\.html\?return_url=/);
  assert.equal(gate.getRememberedReturnUrl(),null);
  const invalid=fixture({stored:{'dojo.auth.return_url.v1':'https://evil.example/'}});
  await invalid.gate.ready;
  assert.equal(invalid.gate.getRememberedReturnUrl(),null);
  assert.equal(invalid.session.values.has('dojo.auth.return_url.v1'),false);
});

test('subscribe is immediate and dispose detaches auth changes',async()=>{
  const f=fixture({user:{uid:'U1'}}),states=[];
  const unsubscribe=f.gate.subscribe(state=>states.push(state.status));
  assert.deepEqual(states,['CHECKING']);
  await f.gate.ready;
  assert.deepEqual(states,['CHECKING','AUTHENTICATED']);
  unsubscribe();
  f.setUser(null);
  assert.deepEqual(states,['CHECKING','AUTHENTICATED']);
  f.gate.dispose();
  assert.equal(f.unsubscribed,true);
});
