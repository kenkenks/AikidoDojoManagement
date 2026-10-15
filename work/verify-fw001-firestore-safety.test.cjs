'use strict';
process.env.TZ='Asia/Tokyo';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{fork}=require('node:child_process');
const {EventEmitter}=require('node:events');
const S=require('./fw001-firestore-safety.cjs'),R=require('./verify-fw001-firestore-real.cjs');
const profile={projectId:S.PROJECT,confirmedDevelopmentProject:S.PROJECT,mode:'development',runtime:'firebase'};
function journal(t,options){
  const dir=fs.mkdtempSync(path.join(__dirname,'fw001-safety-test-'));
  t.after(()=>{if(path.dirname(dir)!==__dirname || !path.basename(dir).startsWith('fw001-safety-test-'))throw Error('UNSAFE_TEST_PATH');fs.rmSync(dir,{recursive:true,force:true});});
  return S.createJournal(dir,options);
}
// Versioned document/query/transaction fake. All data lives in this process.
function database(seed={},hooks={}){
  const records=new Map(Object.entries(structuredClone(seed))),versions=new Map(),writes=[];
  let revision=1;
  const snap=key=>{
    const value=structuredClone(records.get(key));
    return {exists:records.has(key),id:key.split('/').at(-1),ref:doc(key),updateTime:versions.get(key)??1,data:()=>structuredClone(value)};
  };
  const doc=key=>({path:key,id:key.split('/').at(-1),async get(){if(hooks.get)return hooks.get(key,()=>snap(key));return snap(key);},
    async create(value){
      if(hooks.beforeCreate)await hooks.beforeCreate(key,value);
      if(records.has(key))throw Object.assign(Error('EXISTS'),{code:6});
      records.set(key,structuredClone(value));versions.set(key,++revision);writes.push(['create',key]);
      if(hooks.afterCreate)await hooks.afterCreate(key);
    },async delete(options){
      if(hooks.delete)return hooks.delete(key,options,()=>{records.delete(key);writes.push(['delete',key]);});
      assert.equal(options.lastUpdateTime,versions.get(key)??1);records.delete(key);writes.push(['delete',key]);
    }});
  const query=(name,filters=[],limit=Infinity)=>({name,filters,limitValue:limit,
    where(field,op,value){return query(name,[...filters,[field,op,value]],limit);},limit(n){return query(name,filters,n);},
    doc(id){return doc(name+'/'+id);},async get(){return {docs:[...records].filter(([key,data])=>key.startsWith(name+'/') &&
      filters.every(([field,op,value])=>op==='==' && data[field]===value)).slice(0,limit).map(([key])=>snap(key))};}});
  const db={projectId:S.PROJECT,databaseId:S.DATABASE,records,writes,doc,collection:name=>query(name),async terminate(){},
    async runTransaction(fn){const pending=[];let wrote=false;
      const result=await fn({async get(ref){assert.equal(wrote,false);return ref.path?snap(ref.path):ref.get();},
        create(ref,value){wrote=true;pending.push({ref,value,create:true});},set(ref,value){wrote=true;pending.push({ref,value});}});
      if(hooks.commit)await hooks.commit(pending);
      for(const item of pending){if(item.create && records.has(item.ref.path))throw Error('EXISTS');
        records.set(item.ref.path,{...records.get(item.ref.path),...structuredClone(item.value)});versions.set(item.ref.path,++revision);writes.push(['tx',item.ref.path]);}
      return result;
    }};
  return db;
}
function prepared(t){const j=journal(t);j.data.month='2099-07';j.save();return j;}
const hang=()=>new Promise(()=>{});
test('target, database, environment and CLI mode checks fail closed before SDK use',()=>{
  S.validateTarget(profile,{});
  for(const changed of [{projectId:'production'},{confirmedDevelopmentProject:'production'},{mode:'production'},{runtime:'gas'}])assert.throws(()=>S.validateTarget({...profile,...changed},{}));
  for(const env of [{GCLOUD_PROJECT:'production'},{GOOGLE_CLOUD_PROJECT:'production'},{FIRESTORE_DATABASE_ID:'other'},
    {FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},{FIRESTORE_HOST:'evil'},{FIREBASE_CONFIG:'bad'},
    {FIREBASE_CONFIG:'{"projectId":"production"}'},{FIREBASE_AUTH_EMULATOR_HOST:'localhost'}])assert.throws(()=>S.validateTarget(profile,env));
  assert.throws(()=>S.assertDatabase({projectId:'production',databaseId:S.DATABASE},{options:{projectId:S.PROJECT}}));
  assert.throws(()=>S.assertDatabase({projectId:S.PROJECT,databaseId:'other'},{options:{projectId:S.PROJECT}}));
  assert.throws(()=>R.parse([]));assert.throws(()=>R.parse(['--confirm-development','--recover','--journal','x']));
  assert.throws(()=>R.parse(['--confirm-development','--worker']));
});
test('journal precedes dispatch even if create commits and then loses its response',async t=>{
  const j=prepared(t),key='members/'+j.data.ids.member;
  const db=database({}, {beforeCreate:async()=>assert.equal(S.openJournal(j.file).data.documents[key].state,'in_flight'),afterCreate:async()=>{throw Error('CONNECTION_LOST');}});
  await assert.rejects(S.guardedDatabase(db,j,S.gate()).createFixture(key,S.fixtureData(j.data)[key]));
  assert.equal(j.data.lateWritesPossible,true);assert.ok(db.records.has(key));
  const report=await S.inspectOrCleanup(db,j,{remove:true});assert.equal(report.complete,true);assert.equal(db.records.size,0);
});
test('journal persistence failure prevents the remote write',async t=>{
  const j=journal(t,{save:()=>{throw Error('DISK_FULL');}}),db=database(),key='members/'+j.data.ids.member;
  await assert.rejects(S.guardedDatabase(db,j,S.gate()).createFixture(key,S.fixtureData(j.data)[key]),/DISK_FULL/);
  assert.equal(db.writes.length,0);
});
test('journal rename recovers from transient EPERM with atomic replacement',t=>{
  const j=journal(t),rename=fs.renameSync;let attempts=0;
  t.mock.method(fs,'renameSync',(from,to)=>{
    if(++attempts<=2)throw Object.assign(Error('locked'),{code:'EPERM'});
    return rename(from,to);
  });
  j.data.status='retry_saved';j.save();
  assert.equal(attempts,3);
  assert.equal(S.openJournal(j.file).data.status,'retry_saved');
  assert.equal(fs.existsSync(j.file+'.next'),false);
});
test('persistent rename EPERM preserves both journals and prevents remote dispatch',async t=>{
  const j=journal(t),original=fs.readFileSync(j.file),db=database(),key='members/'+j.data.ids.member;
  let attempts=0;const denied=Object.assign(Error('locked'),{code:'EPERM'});
  t.mock.method(fs,'renameSync',()=>{attempts++;throw denied;});
  const started=performance.now();
  await assert.rejects(S.guardedDatabase(db,j,S.gate()).createFixture(key,S.fixtureData(j.data)[key]),e=>e===denied);
  assert.ok(attempts>1 && attempts<=11);
  assert.ok(performance.now()-started<2000);
  assert.deepEqual(fs.readFileSync(j.file),original);
  const pending=JSON.parse(fs.readFileSync(j.file+'.next','utf8'));
  assert.equal(pending.documents[key].state,'in_flight');
  assert.equal(db.writes.length,0);
  assert.equal(db.records.size,0);
});
test('non-EPERM rename errors are propagated without retry or journal damage',t=>{
  const j=journal(t),original=fs.readFileSync(j.file);let attempts=0;
  const denied=Object.assign(Error('denied'),{code:'EACCES'});
  t.mock.method(fs,'renameSync',()=>{attempts++;throw denied;});
  j.data.status='not_saved';
  assert.throws(()=>j.save(),e=>e===denied);
  assert.equal(attempts,1);
  assert.deepEqual(fs.readFileSync(j.file),original);
  assert.equal(JSON.parse(fs.readFileSync(j.file+'.next','utf8')).status,'not_saved');
});
test('pre-existing fixture collision is never overwritten or deleted',async t=>{
  const j=prepared(t),key='members/'+j.data.ids.member,db=database({[key]:S.fixtureData(j.data)[key]});
  await assert.rejects(S.guardedDatabase(db,j,S.gate()).createFixture(key,S.fixtureData(j.data)[key]),/ALREADY_EXISTS/);
  const report=await S.inspectOrCleanup(db,j,{remove:true});assert.equal(report.complete,false);assert.equal(db.writes.length,0);
  assert.equal(report.documents[key],'collision_not_deleted');
});
test('cleanup checks ownership and update preconditions; continues after delete failure',async t=>{
  const j=prepared(t),fixtures=S.fixtureData(j.data),keys=Object.keys(fixtures).slice(0,3);
  keys.forEach(key=>j.intent(key,'create'));
  const db=database(Object.fromEntries(keys.map(key=>[key,fixtures[key]])),{delete:async(key,options,remove)=>{
    assert.ok(Object.hasOwn(options,'lastUpdateTime'));if(key===keys[0])throw Error('PERMISSION_DENIED');remove();
  }});
  const report=await S.inspectOrCleanup(db,j,{remove:true});assert.equal(report.complete,false);
  assert.ok(db.records.has(keys[0]));assert.equal(db.records.size,1);assert.equal(j.data.errors[0].path,keys[0]);
  const changed=database({[keys[0]]:{member_id:'OTHER',billing_group_id:'OTHER'}});
  assert.equal((await S.inspectOrCleanup(changed,j,{remove:true})).documents[keys[0]],'owner_mismatch_not_deleted');assert.equal(changed.writes.length,0);
});
test('stalled cleanup RPC is bounded, diagnosed, and other documents are still attempted',async t=>{
  const j=prepared(t),fixtures=S.fixtureData(j.data),keys=Object.keys(fixtures).slice(0,2);keys.forEach(key=>j.intent(key,'create'));
  const db=database(Object.fromEntries(keys.map(key=>[key,fixtures[key]])),{get:(key,next)=>key===keys[0]?hang():next()});
  const report=await S.inspectOrCleanup(db,j,{remove:true,rpcMs:10});
  assert.equal(report.complete,false);assert.equal(report.documents[keys[0]],'unknown_or_failed');assert.equal(db.records.size,1);
});
test('stalled delete stays unknown even if it completes after the deadline',async t=>{
  const j=prepared(t),fixtures=S.fixtureData(j.data),key=Object.keys(fixtures)[0];j.intent(key,'create');
  let complete;
  const db=database({[key]:fixtures[key]},{delete:(_key,_options,remove)=>new Promise(resolve=>{complete=()=>{remove();resolve();};})});
  const report=await S.inspectOrCleanup(db,j,{remove:true,rpcMs:10});assert.equal(report.complete,false);
  complete();await Promise.resolve();assert.equal(report.documents[key],'unknown_or_failed');
});
test('inspection is read-only; changed document at delete and post-delete reappearance fail',async t=>{
  const j=prepared(t),fixtures=S.fixtureData(j.data),key=Object.keys(fixtures)[0];j.intent(key,'create');
  const db=database({[key]:fixtures[key]});assert.equal((await S.inspectOrCleanup(db,j)).complete,false);assert.equal(db.writes.length,0);
  const racing=database({[key]:fixtures[key]},{delete:async()=>{throw Error('FAILED_PRECONDITION');}});
  assert.equal((await S.inspectOrCleanup(racing,j,{remove:true})).complete,false);
  const reappears=database({[key]:fixtures[key]},{delete:async()=>{}});
  assert.equal((await S.inspectOrCleanup(reappears,j,{remove:true})).documents[key],'still_present');
  let reads=0,late;
  late=database({[key]:fixtures[key]},{get:(_key,next)=>{if(++reads===3)late.records.set(key,fixtures[key]);return next();}});
  assert.equal((await S.inspectOrCleanup(late,j,{remove:true})).documents[key],'reappeared');
});
test('corrupt/out-of-run journals and out-of-run transaction writes are rejected',async t=>{
  const j=prepared(t);j.data.documents['members/REAL_MEMBER']={attempted:true};fs.writeFileSync(j.file,JSON.stringify(j.data));
  assert.throws(()=>S.openJournal(j.file),/OUTSIDE/);delete j.data.documents['members/REAL_MEMBER'];j.save();
  const db=database(),access=S.guardedDatabase(db,j,S.gate());
  await assert.rejects(access.db.runTransaction(tx=>tx.create(db.doc('members/REAL_MEMBER'),{})),/OUTSIDE/);
  assert.equal(db.writes.length,0);
});
test('full real-test path over offline DB inventories all 10 created/modified documents and recovers every one',async t=>{
  const j=journal(t),db=database({'settings/TIME_TRAVEL_ENABLED':{value:'TRUE'},'settings/DEBUG_DATE':{value:'2099-07-09T10:00:00+09:00'},'settings/DEBUG_TARGET_MONTH':{value:'2099-07'}});
  const original=new Map(db.records);await R.roundTrip(db,j,S.gate(),{rpcMs:5000});
  const actual=new Set(db.writes.map(([,key])=>key));assert.equal(actual.size,10);
  assert.deepEqual(new Set(Object.keys(S.openJournal(j.file).data.documents)),actual);
  for(const key of actual)assert.ok(S.owns(j.data,key,db.records.get(key)),key);
  const report=await S.inspectOrCleanup(db,j,{remove:true});assert.equal(report.complete,true);assert.deepEqual(db.records,original);
});
test('transaction timeout aborts future staging, records possible remote commit and stays failed after cleanup',async t=>{
  const j=prepared(t),key='members/'+j.data.ids.member,fields=S.fixtureData(j.data)[key],db=database({[key]:fields},{commit:hang});
  const stop=S.gate(),access=S.guardedDatabase(db,j,stop,{rpcMs:10});
  await assert.rejects(access.db.runTransaction(async tx=>{await tx.get(db.doc(key));tx.set(db.doc(key),{current_rank:'初段'},{merge:true});}),/TIMEOUT/);
  assert.equal(j.data.lateWritesPossible,true);assert.equal(stop.stopped,true);
  await assert.rejects(access.db.runTransaction(()=>{}),/ABORTED/);
  assert.equal(db.records.get(key).current_rank,'一級');
});
test('probe and exceptions close SDK resources; shutdown failures do not report success',async t=>{
  const j=journal(t),db=database();let closed=0,deleted=0;
  db.terminate=async()=>{closed++;throw Error('SHUTDOWN_FAILED');};
  const result=await R.worker({journal:j.file,mode:'probe',rpcMs:20,graceMs:20},S.gate(),
    {connect:async()=>({db,app:{options:{projectId:S.PROJECT}},deleteApp:async()=>{deleted++;}})});
  assert.equal(result.ok,false);assert.equal(closed,1);assert.equal(deleted,1);assert.equal(db.writes.length,0);
});
test('parent performs cleanup only after writer reaping; timeout or uncertain outcome is never PASS',async t=>{
  const j=prepared(t),order=[];j.intent('members/'+j.data.ids.member,'create');
  const result=await S.orchestrate(j.file,{launch:async mode=>{
    order.push(mode);
    if(mode==='run')return {ok:false,timedOut:true,forced:true};
    const current=S.openJournal(j.file);current.data.cleanup={complete:true,documents:{}};current.save();return {ok:true};
  }});
  assert.deepEqual(order,['run','cleanup']);assert.equal(result.exitCode,2);assert.equal(result.status,'remote_outcome_uncertain');
  const blocked=await S.orchestrate(j.file,{launch:async mode=>{assert.equal(mode,'run');return {ok:false,unreaped:true};}});
  assert.equal(blocked.exitCode,3);assert.equal(blocked.status,'writer_not_reaped');
});
test('cleanup worker failure preserves journal diagnosis and returns nonzero',async t=>{
  const j=prepared(t);j.intent('members/'+j.data.ids.member,'create');
  const result=await S.orchestrate(j.file,{launch:async mode=>mode==='run'?{ok:true}:{ok:false,forced:true,timedOut:true}});
  assert.equal(result.exitCode,3);assert.equal(result.status,'cleanup_incomplete');assert.ok(fs.existsSync(result.journal));
});
const spawnFixture=behavior=>()=>fork(path.join(__dirname,'fw001-safety-child-fixture.cjs'),[],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
test('actual child supervision bounds a hung process and rejects an early success message without exit',async()=>{
  for(const behavior of ['hang','result_then_hang']){
    const result=await S.supervise(spawnFixture(behavior),{job:{behavior},timeoutMs:behavior==='result_then_hang'?1000:100,graceMs:100});
    assert.equal(result.ok,false);assert.equal(result.timedOut,true);assert.equal(result.forced,true);assert.notEqual(result.unreaped,true);
    if(behavior==='result_then_hang')assert.equal(result.result.ok,true);
  }
});
test('normal child finishes without forced termination',async()=>{
  const result=await S.supervise(spawnFixture('success'),{job:{behavior:'success'},timeoutMs:2000,graceMs:100});assert.equal(result.ok,true);assert.equal(result.forced,false);
});
test('interrupt requests bounded writer stop and still permits independent cleanup',async()=>{
  const signal=new AbortController();const promise=S.supervise(spawnFixture('hang'),{job:{behavior:'hang'},timeoutMs:2000,graceMs:100,signal:signal.signal});
  signal.abort();const result=await promise;assert.equal(result.interrupted,true);assert.equal(result.ok,false);
});
test('unreapable child and spawn failure are bounded without pretending the writer stopped',async()=>{
  const child=new EventEmitter();Object.assign(child,{pid:123,connected:true,send(_message,callback){callback?.();},kill(){throw Error('DENIED');},disconnect(){},unref(){}});
  const result=await S.supervise(()=>child,{timeoutMs:5,graceMs:5});assert.equal(result.unreaped,true);assert.equal(result.ok,false);
  assert.equal((await S.supervise(()=>{throw Error('SPAWN_FAILED');})).ok,false);
});
test('late rejected RPC is observed and does not cause unhandled rejection',async()=>{
  let reject;const promise=new Promise((_resolve,r)=>{reject=r;});
  await assert.rejects(S.deadline(()=>promise,5),/TIMEOUT/);reject(Error('LATE_REJECTION'));await new Promise(resolve=>setImmediate(resolve));
});
test('partial fixture creation failure is recoverable including a write with unknown outcome',async t=>{
  const j=journal(t);let created=0;
  const db=database({}, {afterCreate:async()=>{if(++created===3)throw Error('RESPONSE_LOST');}});
  await assert.rejects(R.roundTrip(db,j,S.gate(),{rpcMs:1000}));
  assert.equal(Object.keys(j.data.documents).length,3);assert.equal(db.records.size,3);
  assert.equal((await S.inspectOrCleanup(db,j,{remove:true})).complete,true);assert.equal(db.records.size,0);
});
test('stalled fixture create stops work; its intent remains recoverable before any acknowledgement',async t=>{
  const j=prepared(t),key='members/'+j.data.ids.member,fields=S.fixtureData(j.data)[key];
  const db=database({}, {afterCreate:hang}),stop=S.gate();
  await assert.rejects(S.guardedDatabase(db,j,stop,{rpcMs:10}).createFixture(key,fields),/TIMEOUT/);
  assert.ok(S.openJournal(j.file).data.documents[key].attempted);assert.equal(stop.stopped,true);
  assert.equal((await S.inspectOrCleanup(db,j,{remove:true})).complete,true);assert.equal(db.records.size,0);
});
test('transaction committed with a lost response is inventoried and recovered without claiming test success',async t=>{
  const j=prepared(t),key='attendances/ATT-'+j.data.prefix+'_'+'a'.repeat(32),fields={...S.identity(j.data,key)};
  let db;db=database({}, {commit:async pending=>{
    for(const item of pending)db.records.set(item.ref.path,structuredClone(item.value));throw Error('COMMIT_RESPONSE_LOST');
  }});
  await assert.rejects(S.guardedDatabase(db,j,S.gate()).db.runTransaction(tx=>tx.create(db.doc(key),fields)));
  assert.equal(j.data.lateWritesPossible,true);assert.ok(S.openJournal(j.file).data.documents[key]);
  assert.equal((await S.inspectOrCleanup(db,j,{remove:true})).complete,true);assert.equal(db.records.size,0);
});
test('never-resolving SDK shutdown is bounded and still tries the other shutdown operation',async t=>{
  const j=journal(t),db=database();let deleted=0;db.terminate=hang;
  const result=await R.worker({journal:j.file,mode:'probe',rpcMs:10,graceMs:10},S.gate(),
    {connect:async()=>({db,app:{options:{projectId:S.PROJECT}},deleteApp:async()=>{deleted++;}})});
  assert.equal(result.ok,false);assert.equal(deleted,1);assert.equal(S.openJournal(j.file).data.errors.at(-1).operation,'terminate');
});
test('guard denies changing ownership fields on an otherwise owned document',async t=>{
  const j=prepared(t),key='members/'+j.data.ids.member,db=database({[key]:S.fixtureData(j.data)[key]});
  await assert.rejects(S.guardedDatabase(db,j,S.gate()).db.runTransaction(async tx=>{
    await tx.get(db.doc(key));tx.set(db.doc(key),{member_id:'FOREIGN'},{merge:true});
  }),/IDENTITY_MISMATCH/);assert.equal(db.writes.length,0);
});
test('cooperative abort exits the writer without forced kill and never becomes success',async()=>{
  const result=await S.supervise(spawnFixture('cooperate'),{job:{behavior:'cooperate'},timeoutMs:500,graceMs:500});
  assert.equal(result.ok,false);assert.equal(result.timedOut,true);assert.equal(result.forced,false);
});
test('successful assertions become PASS only after separate cleanup and SDK shutdown complete',async t=>{
  const j=journal(t),db=database(),order=[];
  const result=await S.orchestrate(j.file,{launch:async mode=>{
    order.push(mode);
    const value=await R.worker({journal:j.file,mode,rpcMs:5000,graceMs:100},S.gate(),
      {connect:async()=>({db,app:{options:{projectId:S.PROJECT}},deleteApp:async()=>{}})});
    return {ok:value.ok,result:value};
  }});
  assert.equal(result.exitCode,0);assert.equal(result.status,'passed');assert.deepEqual(order,['run','cleanup']);
  assert.equal(db.records.size,0);assert.equal(Object.keys(result.documents).length,10);
  const probeJournal=journal(t),before=db.writes.length;
  const probe=await S.orchestrate(probeJournal.file,{mode:'probe',launch:async mode=>R.worker(
    {journal:probeJournal.file,mode,rpcMs:100,graceMs:100},S.gate(),
    {connect:async()=>({db,app:{options:{projectId:S.PROJECT}},deleteApp:async()=>{}})})});
  assert.equal(probe.exitCode,0);assert.equal(probe.status,'probe_passed');assert.equal(db.writes.length,before);
});
test('read and cleanup helpers reject wrong SDK targets without attempting any operation',async t=>{
  const j=prepared(t),db=database();db.projectId='production';
  assert.throws(()=>S.guardedDatabase(db,j,S.gate()),/TARGET_MISMATCH/);
  await assert.rejects(S.inspectOrCleanup(db,j,{remove:true}),/TARGET_MISMATCH/);
  assert.equal(db.writes.length,0);
});
test('a failed recovery inspection cannot present an old absence check as current',async t=>{
  const j=prepared(t),key='members/'+j.data.ids.member;j.intent(key,'create');
  j.data.cleanup={complete:true,verifiedAt:'2000-01-01',documents:{[key]:'absent'}};j.save();
  const result=await R.controller(['--confirm-development','--inspect','--journal',j.file],
    {env:{},log(){},launch:async()=>({ok:false,timedOut:true,forced:true})});
  assert.equal(result.exitCode,3);assert.equal(result.status,'inspection_incomplete');
  assert.equal(result.documents[key],'not_verified');assert.equal(result.verifiedAt,null);
});
test('worker PID is recorded before the start message and persistence failure blocks job start',async()=>{
  let recorded=false,sent=false;
  const child=new EventEmitter();Object.assign(child,{pid:123,connected:true,
    send(message,callback){if(message.type==='start'){assert.equal(recorded,true);sent=true;setImmediate(()=>{child.emit('message',{type:'result',result:{ok:true}});child.emit('exit',0);});}callback?.();},
    kill(){setImmediate(()=>child.emit('exit',null,'SIGKILL'));},disconnect(){},unref(){}});
  assert.equal((await S.supervise(()=>child,{onSpawn:()=>{recorded=true;},timeoutMs:100})).ok,true);assert.equal(sent,true);
  sent=false;
  assert.equal((await S.supervise(()=>child,{onSpawn:()=>{throw Error('DISK_FULL');},graceMs:5})).ok,false);assert.equal(sent,false);
});
test('recovery verifies absence but does not turn a previously uncertain remote outcome into exit zero',async t=>{
  const j=prepared(t),key='members/'+j.data.ids.member;j.intent(key,'create');j.uncertain();
  const result=await R.controller(['--confirm-development','--recover','--confirm-writer-stopped','--journal',j.file],
    {env:{},log(){},launch:async()=>{const current=S.openJournal(j.file);current.data.cleanup={complete:true,verifiedAt:'2099-07-09',documents:{[key]:'absent'}};current.save();return {ok:true};}});
  assert.equal(result.exitCode,1);assert.equal(result.status,'recovery_verified_remote_uncertain');
  assert.equal(result.lateWritesPossible,true);assert.equal(result.documents[key],'absent');
});
