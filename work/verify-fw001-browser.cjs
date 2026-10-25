'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('web/qr/attendance.html','utf8');
const inline=html.match(/<script>\s*const SESSION_PRIMARY_ROLE[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
const client=fs.readFileSync('web/qr/attendance_firebase_read.js','utf8');
function page({deny=false,noUser=false}={}) {
  const nodes=new Map(),calls=[],logs=[];
  const node=()=>({hidden:false,disabled:false,children:[],addEventListener(){},appendChild(item){this.children.push(item);},
    prepend(item){logs.push(item.textContent);},remove(){},append(){},classList:{add(){},remove(){}},textContent:'',innerHTML:''});
  const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node};
  const user=noUser?null:{uid:'member'};
  let saved=['S1'];
  const auth={ready:Promise.resolve(),getCurrentUser:()=>user,onUserChanged(){}};
  const context={URL,URLSearchParams,Headers,document,console,Date,crypto:{randomUUID:()=> 'test'},navigator:{},
    setTimeout,clearTimeout,DojoVirtualSession:{get:()=>null},
    location:{search:''},addEventListener(){},
    DOJO_RUNTIME_CONFIG:{runtime:'firebase',apiBaseUrl:'https://dojo.example'},
    DOJO_SYSTEM_CONTEXT:{system_now:'2099-07-09 10:00:00'},
    DOJO_FIREBASE_AUTH:{create:()=>auth},
    DOJO_AUTH_GATE:{create:()=>({
      requireAuthenticated:async()=>{if(!user){const error=new Error('UNAUTHENTICATED');error.code='UNAUTHENTICATED';throw error;}return user;},
      subscribe(){},redirectToLogin(){}
    })},
    DOJO_SYSTEM_CONTEXT_ADAPTER:{create:()=>({dependency:()=>({name:'systemContext',run:async()=>({})}),subscribe(){}})},
    DOJO_PAGE_INITIALIZATION_MANAGER:{create:()=>{
      const subscribers=[];
      return {subscribe(fn){subscribers.push(fn);},accessLost(){},retry:async()=>{},
        getState:()=>({status:'READY',generation:1}),isCurrent:generation=>generation===1,
        start:async()=>{subscribers.forEach(fn=>fn({status:'READY',capabilities:{rankOptions:true}}));}};
    }},
    DOJO_API_CLIENT:{create:()=>({request:async(url,init)=>{
      calls.push({url,init});
      if(init.method==='POST') {
        const payload=JSON.parse(init.body);assert.equal(payload.action,'attendance_batch');
        if(deny)return {ok:false,status:403,json:async()=>({error:'FORBIDDEN'})};
        saved=payload.input.attendance_items[0].slot_ids;
        return {ok:true,status:200,json:async()=>({ok:true})};
      }
      const action=new URL(url).searchParams.get('action');
      return {ok:true,json:async()=>action==='attendance_rank_options'?{ok:true,rank_options:[]}:
        {ok:true,member_name:'会員',selected_slot_ids:saved,current_rank:'初段',billing_plan_selected:true,billing_plan_id:'P1',billing_plan_candidates:[]}};
    }})}};
  context.window=context;context.globalThis=context;vm.createContext(context);
  vm.runInContext(client,context);vm.runInContext(inline,context);
  vm.runInContext(`renderCandidates=function(){updateSendButton();};
    currentTeacherId='T1';currentLocationId='L1';currentBillingBlockId='B1';
    memberCandidates=[{member_id:'M1',current_rank:'初段',loaded:true,slot_ids:['S2'],billing_plan_id:'P1',billing_plan_selected:false}];
    updateSendButton();`,context);
  return {context,nodes,calls,logs};
}
const settle=async()=>{for(let index=0;index<4;index+=1)await new Promise(resolve=>setImmediate(resolve));};
test('actual page sends authenticated JSON and restores saved state to its candidate model',async()=>{
  const {context,nodes,calls,logs}=page();await settle();
  assert.equal(nodes.get('sendButton').hidden,false);assert.equal(nodes.get('sendButton').disabled,false);
  vm.runInContext('sendCandidatesToGas()',context);assert.equal(nodes.get('sendButton').disabled,true);
  await settle();
  assert.equal(calls.filter(call=>call.init.method==='POST').length,1);
  assert.ok(calls.some(call=>['attendance_saved_state','member_attendance_state'].includes(new URL(call.url).searchParams.get('action'))));
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(memberCandidates[0].slot_ids)',context)),['S2']);
  assert.equal(vm.runInContext('memberCandidates[0].loaded && !submitting',context),true);
  assert.ok(logs.some(log=>log.includes('保存結果を再確認')));
  assert.equal(nodes.get('sendButton').disabled,false);
});
test('denied write shows an error, releases busy state and never falls back to GAS',async()=>{
  const {context,calls,logs}=page({deny:true});await settle();vm.runInContext('sendCandidatesToGas()',context);await settle();
  assert.equal(calls.filter(call=>call.init.method==='POST').length,1);
  assert.ok(calls.every(call=>call.url.startsWith('https://dojo.example/api/webconnect')));
  assert.ok(logs.some(log=>log.includes('403')));assert.equal(vm.runInContext('submitting',context),false);
});
test('missing Firebase login prevents the registration network call',async()=>{
  const {context,calls}=page({noUser:true});await settle();vm.runInContext('sendCandidatesToGas()',context);await settle();
  assert.equal(calls.filter(call=>call.init.method==='POST').length,0);
  assert.equal(vm.runInContext('submitting',context),false);
});
