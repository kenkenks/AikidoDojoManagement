'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('web/qr/attendance.html','utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(script=>script.trim());
assert.equal(inline.length,1);
const modules=['auth_gate.js','page_initialization_manager.js','system_context_adapter.js']
  .map(name=>fs.readFileSync('web/qr/'+name,'utf8'));
const clock={ok:true,system_now:'2026-10-23 10:30:00',target_month:'2026-10',time_travel_enabled:true,timezone:'Asia/Tokyo'};

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function settle(){return new Promise(resolve=>setImmediate(()=>setImmediate(resolve)));}
class Element {
  constructor(id){this.id=id;this.textContent=id==='locationId'||id==='teacherId'||id==='billingBlockId'?'未設定':'';this.className='';this.hidden=false;this.disabled=false;this.children=[];this.options=this.children;this.value='';this.onclick=null;this._innerHTML='';this.classList={add:()=>{}};}
  set innerHTML(value){this._innerHTML=String(value);if(value==='')this.children.length=0;}
  get innerHTML(){return this._innerHTML;}
  appendChild(child){this.children.push(child);return child;}
  append(...children){this.children.push(...children);}
  prepend(child){this.children.unshift(child);}
  remove(){}
}
class Events {
  constructor(){this.listeners=new Map();}
  addEventListener(name,listener){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(listener);}
  removeEventListener(name,listener){this.listeners.get(name)?.delete(listener);}
  dispatchEvent(event){for(const listener of this.listeners.get(event.type)||[])listener(event);return true;}
}
function boot({sessionResponse,rankResponse,initialUser={uid:'U1'}}={}){
  const authReady=deferred(),calls=[],redirects=[],events=new Events(),nodes=new Map(),authListeners=new Set();
  let currentUser=null;
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
  const document={
    getElementById:node,
    createElement:tag=>new Element(tag),
    body:new Element('body'),head:new Element('head')
  };
  const location={href:'https://dojo.example/qr/attendance.html?teacher_id=T001&location_id=HONBU&member_id=M002',search:'?teacher_id=T001&location_id=HONBU&member_id=M002',assign:value=>redirects.push(value)};
  const storage=new Map();
  const authClient={ready:authReady.promise,getCurrentUser:()=>currentUser,onUserChanged(listener){authListeners.add(listener);return()=>authListeners.delete(listener);},signInWithGoogle:async()=>({user:currentUser}),signOut:async()=>{}};
  const context={console,Promise,AbortController,Set,URL,URLSearchParams,Date,Math,Array,String,Number,location,document,navigator:{vibrate(){}},Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    setTimeout,clearTimeout,crypto:{randomUUID:()=> 'uuid'},
    addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),
    DOJO_RUNTIME_CONFIG:{runtime:'firebase',apiBaseUrl:'https://api.example',firebase:{apiKey:'a',authDomain:'d',projectId:'p',appId:'i'}},
    DOJO_FIREBASE_AUTH:{create:()=>authClient},DOJO_API_CLIENT:{create:()=>({request:async()=>{throw Error('unexpected raw API');}})},
    DOJO_ATTENDANCE_FIREBASE_READ:{request:async options=>{
      calls.push({action:options.action,params:{...options.params}});
      if(options.action==='attendance_session_info'){
        if(sessionResponse instanceof Error)throw sessionResponse;
        if(sessionResponse&&typeof sessionResponse.then==='function')return sessionResponse;
        const locationId=options.params.location_id;
        const blockId=options.params.billing_block_id||'B1';
        return sessionResponse||{ok:true,location_id:locationId,location_name:locationId==='HONBU'?'本部':'別道場',billing_block_id:blockId,billing_block_name:'金曜午前',slots:[{slot_id:'S1',label:'1枠'}]};
      }
      if(options.action==='attendance_rank_options'){
        if(rankResponse instanceof Error)throw rankResponse;
        return rankResponse||{ok:true,rank_options:[]};
      }
      if(options.action==='member_attendance_state')return {ok:true,member_name:'テスト会員',current_rank:'五級',selected_slot_ids:[]};
      throw Error('unexpected action '+options.action);
    }},
    DOJO_ATTENDANCE_FIREBASE_WRITE:{register:async()=>({ok:true})},
    DojoVirtualSession:{get:()=>null,loginMember:(id)=>calls.push({action:'virtual_login',member_id:id}),setContext:()=>null},
    Html5Qrcode:function(){},AudioContext:function(){},webkitAudioContext:function(){}
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);for(const source of modules)vm.runInContext(source,context);vm.runInContext(inline[0],context);
  return {
    context,calls,redirects,nodes,
    resolveAuth(user=initialUser){currentUser=user;authReady.resolve();},
    emitUser(user){currentUser=user;for(const listener of authListeners)listener(user);},
    publishContext(value=clock){context.DOJO_SYSTEM_CONTEXT=value;events.dispatchEvent({type:'dojo-system-context',detail:value});},
    publishContextError(message='clock failed'){events.dispatchEvent({type:'dojo-system-context-error',detail:{message}});}
  };
}

test('does not call business APIs before both Firebase Auth and SystemContext are ready',async()=>{
  for(const order of ['auth-first','context-first']){
    const f=boot();
    if(order==='auth-first')f.resolveAuth();else f.publishContext();
    await settle();assert.equal(f.calls.filter(call=>call.action==='attendance_session_info').length,0,order);
    if(order==='auth-first')f.publishContext();else f.resolveAuth();
    await settle();
    assert.equal(f.calls.filter(call=>call.action==='attendance_session_info').length,1,order);
    assert.equal(f.calls.filter(call=>call.action==='attendance_rank_options').length,1,order);
    assert.equal(f.calls.filter(call=>call.action==='virtual_login'&&call.member_id==='M002').length,1,order);
    assert.equal(f.calls.filter(call=>call.action==='member_attendance_state').length,1,order);
    assert.equal(f.nodes.get('teacherId').textContent,'T001');
    assert.equal(f.nodes.get('locationId').textContent,'本部 (HONBU)');
  }
});

test('unauthenticated access uses index return mode and never calls a business API',async()=>{
  const f=boot({initialUser:null});f.publishContext();f.resolveAuth(null);await settle();
  assert.equal(f.calls.filter(call=>call.action&&call.action!=='virtual_login').length,0);
  assert.equal(f.redirects.length,1);
  const login=new URL(f.redirects[0]);assert.equal(login.pathname,'/qr/index.html');
  assert.match(login.searchParams.get('return_url'),/attendance\.html\?teacher_id=T001/);
});

test('same UID token updates do not reinitialize and auth loss stops controls synchronously',async()=>{
  const f=boot();f.resolveAuth();f.publishContext();await settle();
  const before=f.calls.length;f.emitUser({uid:'U1'});await settle();assert.equal(f.calls.length,before);
  f.emitUser(null);
  assert.equal(f.nodes.get('scanStartButton').disabled,true);
  assert.equal(f.nodes.get('sendButton').disabled,true);
});

test('required session failure blocks operations without starting optional master load',async()=>{
  const f=boot({sessionResponse:new Error('required master failed')});f.resolveAuth();f.publishContext();await settle();
  assert.equal(f.nodes.get('scanStartButton').disabled,true);
  assert.match(f.nodes.get('registrationStatusTitle').textContent,/開始できません/);
  assert.equal(f.calls.some(call=>call.action==='attendance_rank_options'),false);
});

test('optional rank failure keeps unrelated attendance operations available',async()=>{
  const f=boot({rankResponse:new Error('rank unavailable')});f.resolveAuth();f.publishContext();await settle();
  assert.equal(f.nodes.get('scanStartButton').disabled,false);
  assert.match(f.nodes.get('firebaseAttendanceStatus').textContent,/級・段一覧は利用できません/);
});

test('stale initialization response cannot update the page after access loss',async()=>{
  const pending=deferred(),f=boot({sessionResponse:pending.promise});f.resolveAuth();f.publishContext();await settle();
  assert.equal(f.nodes.get('locationId').textContent,'HONBU');
  f.emitUser(null);pending.resolve({ok:true,location_id:'HONBU',location_name:'古い応答',billing_block_id:'OLD',billing_block_name:'旧枠',slots:[]});await settle();
  assert.notEqual(f.nodes.get('locationId').textContent,'古い応答');
});

test('authorization denial stops operations and never causes a login loop',async()=>{
  const f=boot({sessionResponse:new Error('出席情報取得に失敗しました（HTTP 403）。')});f.resolveAuth();f.publishContext();await settle();
  assert.equal(f.redirects.length,0);
  assert.match(f.nodes.get('firebaseAttendanceStatus').textContent,/HTTP 403/);
  assert.equal(f.nodes.get('scanStartButton').disabled,true);
});

test('re-reading the same teacher and location QR preserves candidates and avoids master reload',async()=>{
  const f=boot();f.resolveAuth();f.publishContext();await settle();
  const sessionReads=f.calls.filter(call=>call.action==='attendance_session_info').length;
  const rankReads=f.calls.filter(call=>call.action==='attendance_rank_options').length;
  const memberReads=f.calls.filter(call=>call.action==='member_attendance_state').length;
  assert.equal(f.nodes.get('memberCandidates').children.length,1);
  f.context.onScanSuccess('https://dojo.example/qr/attendance.html?teacher_id=T001&location_id=HONBU');
  await settle();
  assert.equal(f.nodes.get('memberCandidates').children.length,1);
  assert.equal(f.calls.filter(call=>call.action==='attendance_session_info').length,sessionReads);
  assert.equal(f.calls.filter(call=>call.action==='attendance_rank_options').length,rankReads);
  f.context.onScanSuccess('https://dojo.example/qr/member.html?member_id=M002');await settle();
  assert.equal(f.calls.filter(call=>call.action==='member_attendance_state').length,memberReads);
});

test('teacher, location and business-date scope changes do not retain stale candidates',async()=>{
  const teacher=boot();teacher.resolveAuth();teacher.publishContext();await settle();
  teacher.context.onScanSuccess('https://dojo.example/qr/attendance.html?teacher_id=T002');await settle();
  assert.equal(teacher.nodes.get('memberCandidates').children.length,0);
  assert.equal(teacher.calls.filter(call=>call.action==='attendance_session_info').length,1,'teacher change does not reload slot masters');

  const location=boot();location.resolveAuth();location.publishContext();await settle();
  location.context.onScanSuccess('https://dojo.example/qr/attendance.html?teacher_id=T001&location_id=OSAKA');await settle();
  assert.equal(location.nodes.get('memberCandidates').children.length,0);
  assert.equal(location.calls.filter(call=>call.action==='attendance_session_info').length,2);

  const date=boot();date.resolveAuth();date.publishContext();await settle();
  date.publishContext({...clock,system_now:'2026-10-24 10:30:00'});await settle();
  assert.equal(date.nodes.get('memberCandidates').children.length,0);
  assert.equal(date.calls.filter(call=>call.action==='attendance_session_info').length,2);
});
