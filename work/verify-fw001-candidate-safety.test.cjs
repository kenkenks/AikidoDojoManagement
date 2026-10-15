'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const S=require('./fw001-firestore-safety.cjs'),C=require('./fw001-candidate-safety.cjs');
const {monthlySelectionDocumentId}=require('../cloud/attendance/monthly-selection-key.cjs');
function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fw001-staged-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const j=C.configure(S.createJournal(dir),{date:'2099-07-09',month:'2099-07'});
  const records=new Map(),deletes=[],db={projectId:S.PROJECT,databaseId:S.DATABASE};
  const snap=key=>({exists:records.has(key),ref:{path:key},updateTime:1,data:()=>structuredClone(records.get(key))});
  db.doc=key=>({async get(){if(db.getHook)await db.getHook(key);return snap(key);},async create(value){
    if(records.has(key))throw Object.assign(Error('EXISTS'),{code:6});records.set(key,structuredClone(value));
  },async delete(options){
    assert.equal(options.lastUpdateTime,1);if(db.deleteHook)await db.deleteHook(key);records.delete(key);deletes.push(key);
  }});
  db.collection=name=>({where(field,op,value){assert.equal(op,'==');return {limit(n){return {async get(){
    if(db.queryHook)await db.queryHook(name);
    return {docs:[...records].filter(([key,row])=>key.startsWith(name+'/')&&row[field]===value).slice(0,n).map(([key])=>snap(key))};
  }};}};}});
  return {j,db,records,deletes};
}
const current=f=>S.openJournal(f.j.file);
async function ready(t){
  const f=setup(t);await C.preflight(f.db,f.j);
  await C.createFixtures(f.db,f.j);
  return f;
}
function facts(f,kind='register',suffix='12345678-1234-4234-8234-123456789abc'){
  const j=current(f).data,i=j.ids,m=j.month;
  const rows={
    ['attendances/ATT-'+suffix]:{attendance_id:'ATT-'+suffix,member_id:i.member,location_id:i.dojo,billing_block_id:i.block,
      teacher_id:i.teacher,attendance_session_id:j.prefix+'_SESSION',target_month:m,'稽古日':j.date,slot_id:i.slot,'状態':kind==='cancel'?'取消':'有効'},
    ['invoices/INV-'+m+'-'+i.group+'-'+i.member+'-12345678']:{invoice_id:'INV-'+m+'-'+i.group+'-'+i.member+'-12345678',
      member_id:i.member,billing_group_id:i.group,target_month:m,plan_id:i.plan,'請求予定額':1000},
    ['monthly_selections/'+monthlySelectionDocumentId(i.group,m)]:{member_id:i.member,billing_group_id:i.group,target_month:m},
    ['payment_status_views/view_'+monthlySelectionDocumentId(i.member,m)]:{member_id:i.member,target_month:m,'請求額':1000}
  };
  for(const entry of Object.entries(rows))f.records.set(...entry);
  if(f.records.has('members/'+i.member))f.records.get('members/'+i.member).current_rank='初段';return rows;
}
function browser(f,{responseLost=false,status=200,badBody=false,badRead=false,jsonLoss=false,timeout=false}={}){
  let posts=0,gets=0;const outputs=[];
  const ctx={location:{origin:'https://dojo-management-dev.web.app',pathname:'/qr/qr_generator.html',search:'?qr_candidate=1'},
    RUNTIME_CONFIG:{target:'dev-firebase',firebase:{projectId:'dojo-management-dev'}},URLSearchParams,AbortController,
    crypto:require('node:crypto').webcrypto,TextEncoder,
    setTimeout:timeout?fn=>setTimeout(fn,1):setTimeout,clearTimeout,console:{log:value=>outputs.push(JSON.parse(value))},
    dojoApiClient:{request:async(url,init)=>{
      assert.ok(url.startsWith(C.URL+'/api/webconnect'));assert.equal(init.redirect,'error');
      if(init.method==='POST'){
        posts++;const payload=JSON.parse(init.body),j=current(f).data;
        assert.equal(j.candidate.pending,true);assert.equal(j.lateWritesPossible,true);
        const op=j.candidate.operations.at(-1);assert.deepEqual(payload.input,op.input);
        assert.equal(payload.action,'attendance_batch');
        facts(f,op.kind);
        if(timeout)return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Error('secret-timeout'))));
        if(responseLost)throw Error('secret-token-body');
        return {status,json:async()=>{if(jsonLoss)throw Error('secret-json');return {ok:!badBody,
          [{register:'registered_count',repeat:'retained_count',cancel:'cancelled_count'}[op.kind]]:1};}};
      }
      gets++;const j=current(f).data,op=j.candidate.operations.at(-1),i=j.ids;
      return {status:badRead?403:200,json:async()=>({ok:true,member_id:i.member,current_rank:'初段',
        selected_slot_ids:op.input.attendance_items[0].slot_ids,billing_plan_selected:true,billing_plan_id:i.plan})};
    }}};
  ctx.window=ctx;vm.createContext(ctx);
  return {run:code=>vm.runInContext(code,ctx),outputs,ctx,get posts(){return posts;},get gets(){return gets;}};
}
const noWait=async()=>{};
test('staged normal flow persists and rereads each operation before browser POST, verifies then recovers ten docs',async t=>{
  const f=await ready(t),b=browser(f);
  for(const [index,kind]of ['register','repeat','cancel'].entries()){
    const prepared=await C.prepareOperation(f.db,f.j,kind);
    const op=current(f).data.candidate.operations.at(-1);
    assert.equal(op.number,index+1);assert.equal(op.testId,f.j.data.prefix);assert.equal(op.url,C.URL);assert.equal(op.inputHash,prepared.inputHash);
    await assert.rejects(C.prepareOperation(f.db,f.j,kind),/SEND_BLOCKED/);
    await b.run(prepared.code);
    assert.equal((await C.confirmOperation(f.db,f.j,b.outputs.at(-1))).status,'verified');
  }
  assert.equal(b.posts,3);assert.equal(b.gets,3);assert.equal(Object.keys(current(f).data.documents).length,10);
  const result=await C.recover(f.db,f.j,{wait:noWait});
  assert.equal(result.status,'passed');assert.equal(f.records.size,0);assert.ok(Object.values(result.documents).every(s=>s==='absent'));
});
test('same generated code cannot be used twice in the same tab',async t=>{
  const f=await ready(t),b=browser(f),p=await C.prepareOperation(f.db,f.j,'register');
  await b.run(p.code);await assert.rejects(b.run(p.code),/ALREADY_USED/);assert.equal(b.posts,1);
});
test('concurrent tab execution sends once; edited fixed input fails hash verification before POST',async t=>{
  const f=await ready(t),b=browser(f),p=await C.prepareOperation(f.db,f.j,'register');
  const results=await Promise.allSettled([b.run(p.code),b.run(p.code)]);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(b.posts,1);
  const g=await ready(t),c=browser(g),q=await C.prepareOperation(g.db,g.j,'register');
  const edited=q.code.replace('"current_rank":"初段"','"current_rank":"OTHER"');assert.notEqual(edited,q.code);
  await assert.rejects(c.run(edited),/HASH_MISMATCH/);assert.equal(c.posts,0);
});
test('save failure returns no code and restores no send permission',async t=>{
  const f=await ready(t),rename=fs.renameSync;
  t.mock.method(fs,'renameSync',(from,to)=>{if(to===f.j.file)throw Object.assign(Error('EPERM'),{code:'EPERM'});return rename(from,to);});
  await assert.rejects(C.prepareOperation(f.db,f.j,'register'),/EPERM/);
  assert.equal(current(f).data.candidate.operations.length,0);
  assert.ok(fs.existsSync(f.j.file+'.next'));
});
test('disk readback mismatch returns no browser code; persisted pending blocks retry',async t=>{
  const f=await ready(t),rename=fs.renameSync;
  t.mock.method(fs,'renameSync',(from,to)=>{
    rename(from,to);
    if(to===f.j.file){const data=JSON.parse(fs.readFileSync(to,'utf8'));data.status='unexpected-edit';fs.writeFileSync(to,JSON.stringify(data));}
  });
  await assert.rejects(C.prepareOperation(f.db,f.j,'register'),/READBACK_MISMATCH/);
  await assert.rejects(C.prepareOperation(f.db,f.j,'register'),/SEND_BLOCKED/);
});
test('stale handles cannot bypass a pending or unknown operation',async t=>{
  const f=await ready(t),stale=current(f),b=browser(f,{responseLost:true});
  const p=await C.prepareOperation(f.db,f.j,'register');await b.run(p.code);
  assert.equal((await C.confirmOperation(f.db,f.j,b.outputs[0])).status,'remote_outcome_uncertain');
  await assert.rejects(C.prepareOperation(f.db,stale,'register'),/SEND_BLOCKED/);
  await assert.rejects(C.prepareOperation(f.db,stale,'cancel'),/SEND_BLOCKED/);assert.equal(b.posts,1);
  assert.doesNotMatch(fs.readFileSync(f.j.file,'utf8'),/secret-token-body/);
});
test('concurrent handle and different process cannot acquire the journal lock',async t=>{
  const f=await ready(t);let release,entered;
  const enter=new Promise(resolve=>{entered=resolve;});
  f.db.getHook=async()=>{entered();await new Promise(resolve=>{release=resolve;});f.db.getHook=null;};
  const pending=C.prepareOperation(f.db,f.j,'register');await enter;
  await assert.rejects(C.prepareOperation(f.db,f.j,'register'),/JOURNAL_LOCKED/);
  const child=spawnSync(process.execPath,['-e',"const fs=require('node:fs');try{fs.openSync(process.argv[1],'wx');process.exitCode=1}catch(e){process.exitCode=e.code==='EEXIST'?0:2}",f.j.file+'.lock'],{windowsHide:true});
  assert.equal(child.status,0);release();await pending;
});
test('HTTP loss/timeout/403/JSON loss preserves uncertainty; recovery and legacy cleanup cannot delete',async t=>{
  for(const options of [{responseLost:true},{timeout:true},{status:403},{jsonLoss:true},{badBody:true}]){
    const f=await ready(t),b=browser(f,options),p=await C.prepareOperation(f.db,f.j,'register');
    await b.run(p.code);const report=b.outputs[0];assert.equal(report.outcome,'unknown');
    await C.confirmOperation(f.db,f.j,report);
    await assert.rejects(C.prepareOperation(f.db,f.j,'cancel'),/SEND_BLOCKED/);
    const r=await C.recover(f.db,f.j,{wait:noWait});assert.equal(r.readOnly,true);assert.equal(r.status,'remote_outcome_uncertain');
    assert.equal(f.deletes.length,0);
    await assert.rejects(S.inspectOrCleanup(f.db,current(f),{remove:true}),/REMOTE_OUTCOME_UNCERTAIN/);
    assert.doesNotMatch(JSON.stringify(report)+fs.readFileSync(f.j.file,'utf8'),/secret-/);
  }
});
test('late report cannot convert an unknown outcome into success',async t=>{
  const f=await ready(t),b=browser(f,{responseLost:true}),p=await C.prepareOperation(f.db,f.j,'register');await b.run(p.code);
  await C.confirmOperation(f.db,f.j,b.outputs[0]);
  await assert.rejects(C.confirmOperation(f.db,f.j,{...b.outputs[0],outcome:'confirmed',status:200,matched:true}),/CONFIRM_BLOCKED/);
  assert.equal(current(f).data.lateWritesPossible,true);
});
test('unfinished, collision or uncertain creation receipts block code generation',async t=>{
  for(const state of ['in_flight','collision','uncertain']){
    const f=await ready(t),j=current(f),key=Object.keys(S.fixtureData(j.data))[0];j.data.documents[key].state=state;j.save();
    await assert.rejects(C.prepareOperation(f.db,f.j,'register'),/NOT_ACKNOWLEDGED/);
  }
});
test('missing master and ownership mismatch block code generation',async t=>{
  for(const change of ['missing','owner']){
    const f=await ready(t),key='members/'+f.j.data.ids.member;
    if(change==='missing')f.records.delete(key);else f.records.get(key).billing_group_id='OTHER';
    await assert.rejects(C.prepareOperation(f.db,f.j,'register'),/NOT_OWNED/);
  }
});
test('fixture creation failure stops preparation and cannot be mistaken for completed creation',async t=>{
  const f=setup(t);await C.preflight(f.db,f.j);
  const original=f.db.doc;let creates=0;
  f.db.doc=key=>{const ref=original(key);return {...ref,async create(value){if(++creates===2)throw Error('LOST_RESPONSE');return ref.create(value);}};};
  await assert.rejects(C.createFixtures(f.db,f.j),/FIXTURES_FAILED/);
  await assert.rejects(C.prepareOperation(f.db,f.j,'register'),/SEND_BLOCKED/);
  const result=await C.recover(f.db,f.j,{wait:noWait});assert.equal(result.readOnly,true);assert.equal(f.deletes.length,0);
});
test('report operation/input/URL mismatch or duplicate report cannot advance sequence',async t=>{
  const f=await ready(t),b=browser(f),p=await C.prepareOperation(f.db,f.j,'register');await b.run(p.code);
  for(const patch of [{number:2},{testId:'OTHER'},{url:'https://other.example'},{inputHash:'0'.repeat(64)},{extra:'secret'}])
    await assert.rejects(C.confirmOperation(f.db,f.j,{...b.outputs[0],...patch}),/REPORT_MISMATCH/);
  assert.equal(current(f).data.candidate.pending,true);
  await C.confirmOperation(f.db,f.j,b.outputs[0]);await assert.rejects(C.confirmOperation(f.db,f.j,b.outputs[0]),/CONFIRM_BLOCKED/);
});
test('browser readback failure or local fact mismatch stops next operation but permits known-complete cleanup',async t=>{
  for(const badRead of [true,false]){
    const f=await ready(t),b=browser(f,{badRead}),p=await C.prepareOperation(f.db,f.j,'register');await b.run(p.code);
    if(!badRead){const key=[...f.records.keys()].find(k=>k.startsWith('invoices/'));f.records.get(key)['請求予定額']=0;}
    assert.equal((await C.confirmOperation(f.db,f.j,b.outputs[0])).status,'verification_failed');
    await assert.rejects(C.prepareOperation(f.db,f.j,'repeat'),/SEND_BLOCKED/);
    const r=await C.recover(f.db,f.j,{wait:noWait});assert.equal(r.status,'verification_incomplete');assert.equal(f.records.size,0);
  }
});
test('baseline collision, wrong project and invalid browser context fail closed',async t=>{
  const f=setup(t);f.records.set('members/'+f.j.data.ids.member,{member_id:f.j.data.ids.member});
  await assert.rejects(C.preflight(f.db,f.j),/COLLISION/);f.db.projectId='production';await assert.rejects(C.discover(f.db,f.j),/SDK_TARGET/);
  const g=await ready(t),b=browser(g),p=await C.prepareOperation(g.db,g.j,'register');b.ctx.location.origin='https://other.example';
  await assert.rejects(b.run(p.code),/BROWSER_CONTEXT/);assert.equal(b.posts,0);
});
test('ownership mismatch admits no new paths and prevents deletes',async t=>{
  const f=await ready(t),b=browser(f),p=await C.prepareOperation(f.db,f.j,'register');await b.run(p.code);
  const row=[...f.records].find(([key])=>key.startsWith('attendances/'))[1];row.attendance_session_id='OTHER';
  await assert.rejects(C.discover(f.db,f.j),/OWNER_MISMATCH/);assert.equal(Object.keys(current(f).data.documents).length,6);assert.equal(f.deletes.length,0);
});
test('every attendance ownership field is required and collection scope is unchanged',async t=>{
  const f=await ready(t),rows=facts(f),[key,row]=Object.entries(rows)[0];
  for(const field of Object.keys(S.identity(current(f).data,key)))assert.equal(S.owns(current(f).data,key,{...row,[field]:'OTHER'}),false,field);
  assert.throws(()=>S.identity(current(f).data,'payments/anything'),/OUTSIDE_RUN/);
});
async function confirmed(t){const f=await ready(t),b=browser(f),p=await C.prepareOperation(f.db,f.j,'register');await b.run(p.code);await C.confirmOperation(f.db,f.j,b.outputs[0]);return f;}
test('delayed new ID is rediscovered; final reappearance prevents success',async t=>{
  const f=await confirmed(t);let waits=0;
  const r=await C.recover(f.db,f.j,{wait:async()=>{if(++waits===1)facts(f,'register','abcdefab-1234-4234-8234-123456789abc');}});
  assert.equal(r.complete,true);assert.equal(f.records.size,0);
  const g=await confirmed(t);waits=0;
  const again=await C.recover(g.db,g.j,{wait:async()=>{
    if(++waits===2){const rows=facts(g);g.records.delete('members/'+g.j.data.ids.member);void rows;}
  }});
  assert.equal(again.complete,false);assert.equal(again.status,'cleanup_incomplete');
});
test('delete failure, owner change and query failure cannot become PASS',async t=>{
  const f=await confirmed(t);f.db.deleteHook=async()=>{throw Error('DELETE_FAILED');};
  assert.equal((await C.recover(f.db,f.j,{wait:noWait})).complete,false);assert.equal(f.deletes.length,0);
  const g=await confirmed(t);g.db.getHook=async key=>{if(key.startsWith('attendances/')&&g.records.has(key))g.records.get(key).attendance_session_id='OTHER';};
  const r=await C.recover(g.db,g.j,{wait:noWait});assert.equal(r.complete,false);assert.ok(g.deletes.every(k=>!k.startsWith('attendances/')));
  const h=await confirmed(t);h.db.queryHook=async()=>{throw Error('UNAVAILABLE');};
  await assert.rejects(C.recover(h.db,h.j,{wait:noWait}),/UNAVAILABLE/);assert.equal(h.deletes.length,0);
});
test('old boolean recovery override is rejected and generated-but-unexecuted code stays read-only',async t=>{
  const f=await ready(t);await C.prepareOperation(f.db,f.j,'register');
  await assert.rejects(C.recover(f.db,f.j,{confirmRemoteStopped:true}),/UNSUPPORTED/);
  const r=await C.recover(f.db,f.j,{wait:noWait});assert.equal(r.readOnly,true);assert.equal(f.deletes.length,0);
});
