'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('web/qr/index.html','utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(Boolean);
assert.equal(inline.length,1,'index inline script');
const gateSource=fs.readFileSync('web/qr/auth_gate.js','utf8');

function settle(){return new Promise(resolve=>setImmediate(resolve));}

function boot({search='',user=null,signInError=null,runtime='firebase'}={}){
  let currentUser=user,authListener=null,storedSession=null;
  const calls=[],nodes=new Map(),storageValues=new Map(),redirects=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{id,hidden:id==='firebaseLoginButton',disabled:false,textContent:'',innerHTML:'',className:'',onclick:null});
    return nodes.get(id);
  };
  const location={
    href:'https://dojo.example/qr/index.html'+search,
    search,
    assign:value=>redirects.push(value)
  };
  const sessionStorage={
    getItem:key=>storageValues.has(key)?storageValues.get(key):null,
    setItem:(key,value)=>storageValues.set(key,String(value)),
    removeItem:key=>storageValues.delete(key)
  };
  const authClient={
    ready:Promise.resolve(),
    getCurrentUser:()=>currentUser,
    onUserChanged:listener=>{authListener=listener;return()=>{authListener=null;}},
    async signInWithGoogle(){
      calls.push(['firebaseSignIn']);
      if(signInError)throw signInError;
      currentUser={uid:'U1'};
      if(authListener)authListener(currentUser);
      return {user:currentUser};
    },
    async signOut(){currentUser=null;if(authListener)authListener(null);}
  };
  const DojoVirtualSession={
    setEntryContext:patch=>calls.push(['setEntryContext',patch]),
    loginTeacher:(id,source)=>{calls.push(['loginTeacher',id,source]);storedSession={role:'TEACHER',subject_id:id};return storedSession;},
    loginMember:(id,source)=>{calls.push(['loginMember',id,source]);storedSession={role:'MEMBER',subject_id:id};return storedSession;},
    get:()=>storedSession,
    logout:()=>{calls.push(['virtualLogout']);storedSession=null;}
  };
  const context={
    console,URL,URLSearchParams,Promise,setImmediate,
    location,sessionStorage,DojoVirtualSession,
    document:{getElementById:node},
    DOJO_RUNTIME_CONFIG:{runtime,firebase:{apiKey:'a',authDomain:'d',projectId:'p',appId:'i'}},
    DOJO_FIREBASE_AUTH:{create:()=>{calls.push(['createFirebaseAuth']);return authClient;}},
    Html5Qrcode:null
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(gateSource,context);
  vm.runInContext(inline[0],context);
  return {context,calls,nodes,redirects,storageValues,authClient,setUser(next){currentUser=next;if(authListener)authListener(next);}};
}

test('normal access preserves the existing QR and VirtualSession entry without creating Firebase Auth',()=>{
  const f=boot({search:'?teacher_id=T001&location_id=HONBU'});
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[
    ['setEntryContext',{location_id:'HONBU'}],
    ['loginTeacher','T001','PAGE_URL']
  ]);
  assert.equal(f.context.location.href,'teacher_home.html');
  assert.equal(f.nodes.get('normalEntryControls')?.hidden||false,false);
});

test('return mode waits for authentication, keeps VirtualSession untouched and returns after login',async()=>{
  const target='/qr/attendance.html?location_id=HONBU&member_id=M1';
  const f=boot({search:'?return_url='+encodeURIComponent(target)});
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[['createFirebaseAuth']]);
  assert.equal(f.nodes.get('normalEntryControls').hidden,true);
  assert.equal(f.nodes.get('firebaseLoginButton').hidden,false);
  assert.equal(f.nodes.get('loginState').textContent,'続けるにはGoogleログインが必要です。');
  await f.nodes.get('firebaseLoginButton').onclick();
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[['createFirebaseAuth'],['firebaseSignIn']]);
  assert.deepEqual(f.redirects,[target]);
  assert.equal(f.storageValues.size,0,'return URL is cleared only after successful authentication');
});

test('authenticated return mode skips the login button and returns without granting a VirtualSession role',async()=>{
  const target='/qr/member_management.html';
  const f=boot({search:'?return_url='+encodeURIComponent(target),user:{uid:'ADMIN'}});
  await settle();
  assert.deepEqual(f.redirects,[target]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[['createFirebaseAuth']]);
});

test('login failure retains the safe return URL and allows retry',async()=>{
  const target='/qr/attendanceCheck.html?teacher_id=T1';
  const f=boot({search:'?return_url='+encodeURIComponent(target),signInError:new Error('popup closed')});
  await settle();
  await f.nodes.get('firebaseLoginButton').onclick();
  await settle();
  assert.equal(f.redirects.length,0);
  assert.equal(f.nodes.get('firebaseLoginButton').hidden,false);
  assert.equal(f.nodes.get('firebaseLoginButton').disabled,false);
  assert.equal(f.storageValues.get('dojo.auth.return_url.v1'),target);
});

test('invalid, external and recursive return URLs never start Firebase login or redirect',async()=>{
  for(const target of ['https://evil.example/x','/qr/index.html?return_url=x','javascript:alert(1)']){
    const f=boot({search:'?return_url='+encodeURIComponent(target)});
    await settle();
    assert.deepEqual(f.redirects,[],target);
    assert.equal(f.nodes.get('firebaseLoginButton').hidden,true,target);
    assert.match(f.nodes.get('loginState').textContent,/復帰先URLが不正/);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[]);
  }
});

test('return mode fails closed outside Firebase while normal GAS entry remains unchanged',async()=>{
  const blocked=boot({search:'?return_url='+encodeURIComponent('/qr/attendance.html'),runtime:'gas'});
  await settle();
  assert.equal(blocked.redirects.length,0);
  assert.match(blocked.nodes.get('loginState').textContent,/Firebaseログインを利用できません/);
  assert.deepEqual(blocked.calls,[]);
  const normal=boot({runtime:'gas'});
  assert.deepEqual(normal.calls,[]);
  assert.equal(normal.nodes.get('normalEntryControls')?.hidden||false,false);
});
