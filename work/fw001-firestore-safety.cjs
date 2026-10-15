'use strict';
// Test infrastructure only: importing this file never loads an SDK or connects.
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {monthlySelectionDocumentId}=require('../cloud/attendance/monthly-selection-key.cjs');
const PROJECT='dojo-management-dev',DATABASE='(default)',SCHEMA='fw001-roundtrip-journal-v2';
function failure(code){return Object.assign(new Error(code),{code});}
function errorInfo(error){const code=String(error?.code || error?.message || 'UNKNOWN');return {code:/^[A-Za-z0-9_.:-]{1,100}$/.test(code)?code:'UNCLASSIFIED_ERROR'};}
function validateTarget(profile,env=process.env){
  if(profile?.projectId!==PROJECT || profile.confirmedDevelopmentProject!==PROJECT || profile.mode!=='development' || profile.runtime!=='firebase')throw failure('DEVELOPMENT_TARGET_REQUIRED');
  for(const key of ['FIRESTORE_EMULATOR_HOST','FIRESTORE_HOST','FIREBASE_AUTH_EMULATOR_HOST','GOOGLE_API_USE_MTLS_ENDPOINT'])if(env[key])throw failure('ENDPOINT_OVERRIDE_NOT_ALLOWED');
  for(const key of ['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT'])if(env[key] && env[key]!==PROJECT)throw failure('PROJECT_ENV_MISMATCH');
  if(env.FIRESTORE_DATABASE_ID && env.FIRESTORE_DATABASE_ID!==DATABASE)throw failure('DATABASE_ENV_MISMATCH');
  if(env.GOOGLE_CLOUD_UNIVERSE_DOMAIN && env.GOOGLE_CLOUD_UNIVERSE_DOMAIN!=='googleapis.com')throw failure('ENDPOINT_OVERRIDE_NOT_ALLOWED');
  if(env.FIREBASE_CONFIG){let c;try{c=JSON.parse(env.FIREBASE_CONFIG);}catch{throw failure('FIREBASE_CONFIG_MUST_BE_EXPLICIT_JSON');}if(c.projectId!==PROJECT)throw failure('FIREBASE_CONFIG_PROJECT_MISMATCH');}
}
function assertClient(db){if(db?.projectId!==PROJECT || db.databaseId!==DATABASE)throw failure('SDK_TARGET_MISMATCH');}
function assertDatabase(db,app){assertClient(db);if(app?.options?.projectId!==PROJECT)throw failure('SDK_TARGET_MISMATCH');}
function idsFor(p){return {member:p+'_M',group:p+'_BG',teacher:p+'_T',dojo:p+'_L',block:p+'_B',slot:p+'_S',plan:p+'_P'};}
function fixtureData(j){const i=j.ids;return {
  ['members/'+i.member]:{member_id:i.member,member_name:'FW001接続検証',status:'有効',billing_group_id:i.group,member_type:'FW001検証',current_rank:'一級'},
  ['teachers/'+i.teacher]:{teacher_id:i.teacher,status:'有効',can_accept_attendance:true},
  ['dojos/'+i.dojo]:{location_id:i.dojo,status:'有効',display_name:'FW001検証'},
  ['billing_blocks/'+i.block]:{billing_block_id:i.block,location_id:i.dojo,status:'有効',slots_per_charge:2},
  ['training_slots/'+i.slot]:{slot_id:i.slot,location_id:i.dojo,billing_block_id:i.block,status:'有効',duration_minutes:60},
  ['fees/'+i.plan]:{plan_id:i.plan,status:'有効',display_name:'FW001検証',membership_fee_type:'月額',unit_price:1000,maximum_amount:0}
};}
function identity(j,key){const i=j.ids;const fixed={
  ['members/'+i.member]:{member_id:i.member,billing_group_id:i.group},['teachers/'+i.teacher]:{teacher_id:i.teacher},
  ['dojos/'+i.dojo]:{location_id:i.dojo},['billing_blocks/'+i.block]:{billing_block_id:i.block,location_id:i.dojo},
  ['training_slots/'+i.slot]:{slot_id:i.slot,location_id:i.dojo,billing_block_id:i.block},['fees/'+i.plan]:{plan_id:i.plan}
};
  if(fixed[key])return fixed[key];
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(j.month || ''))throw failure('DOCUMENT_OUTSIDE_RUN');
  if(key==='monthly_selections/'+monthlySelectionDocumentId(i.group,j.month))return {member_id:i.member,billing_group_id:i.group,target_month:j.month};
  if(key==='payment_status_views/view_'+monthlySelectionDocumentId(i.member,j.month))return {member_id:i.member,target_month:j.month};
  if(key==='invoices/INV-'+j.month+'-'+i.group+'-'+i.member+'-'+j.prefix.slice(0,8))return {member_id:i.member,billing_group_id:i.group,target_month:j.month,plan_id:i.plan};
  if(new RegExp('^attendances/ATT-'+j.prefix+'_[a-f0-9]{32}$').test(key))return {member_id:i.member,location_id:i.dojo,billing_block_id:i.block,teacher_id:i.teacher,attendance_session_id:j.prefix+'_SESSION'};
  throw failure('DOCUMENT_OUTSIDE_RUN');
}
function owns(j,key,fields){return Object.entries(identity(j,key)).every(([name,value])=>fields?.[name]===value);}
function validateJournal(j){
  if(j?.schema!==SCHEMA || j.projectId!==PROJECT || j.databaseId!==DATABASE || !/^FW001TEST_[a-f0-9]{32}$/.test(j.prefix || '') ||
      JSON.stringify(j.ids)!==JSON.stringify(idsFor(j.prefix)) || !j.documents || Array.isArray(j.documents) || typeof j.documents!=='object' || Object.keys(j.documents).length>5000 || !Array.isArray(j.errors))throw failure('INVALID_RUN_JOURNAL');
  for(const [key,value]of Object.entries(j.documents)){identity(j,key);if(!value || typeof value.attempted!=='boolean')throw failure('INVALID_RUN_JOURNAL');}
  return j;
}
function atomicSave(file,data){
  const temp=file+'.next',fd=fs.openSync(temp,'w',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  // Keep the old journal intact until replacement succeeds. Only transient
  // Windows EPERM is retryable; persistent failures leave both files for diagnosis.
  const until=performance.now()+200,waiter=new Int32Array(new SharedArrayBuffer(4));
  for(let retries=0;;retries++){
    try{fs.renameSync(temp,file);break;}
    catch(error){
      const remaining=until-performance.now();
      if(error.code!=='EPERM' || retries>=10 || remaining<=0)throw error;
      Atomics.wait(waiter,0,0,Math.min(20,remaining));
    }
  }
}
function journalAccess(file,data,save=atomicSave){return {file,data,
  save(){validateJournal(data);save(file,data);},
  issue(phase,operation,key,error){data.errors.push({phase,operation,path:key || null,...errorInfo(error)});this.save();},
  intent(key,operation){identity(data,key);data.documents[key]={...data.documents[key],attempted:true,operation,state:'in_flight'};this.save();},
  state(key,state){data.documents[key].state=state;this.save();},
  uncertain(){data.lateWritesPossible=true;this.save();}
};}
function createJournal(dir,{prefix='FW001TEST_'+randomUUID().replace(/-/g,''),save=atomicSave}={}){
  fs.mkdirSync(dir,{recursive:true});const file=path.resolve(dir,prefix+'.json');
  const data=validateJournal({schema:SCHEMA,projectId:PROJECT,databaseId:DATABASE,prefix,ids:idsFor(prefix),createdAt:new Date().toISOString(),status:'prepared',documents:{},errors:[],lateWritesPossible:false});
  const fd=fs.openSync(file,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  return journalAccess(file,data,save);
}
function openJournal(file){return journalAccess(path.resolve(file),validateJournal(JSON.parse(fs.readFileSync(file,'utf8'))));}
function gate(){let stopped=false;return {abort(){stopped=true;},check(){if(stopped)throw failure('RUN_ABORTED');},get stopped(){return stopped;}};}
async function deadline(start,ms,code='RPC_TIMEOUT'){
  let timer;try{return await Promise.race([Promise.resolve().then(start),new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure(code)),ms);})]);}finally{clearTimeout(timer);}
}
function collision(error){return error?.code===6 || ['ALREADY_EXISTS','already-exists'].includes(error?.code);}
function guardedDatabase(db,journal,stop,{rpcMs=10000}={}){
  assertClient(db);
  const rpc=start=>{stop.check();return deadline(start,rpcMs);};
  const guarded={collection:db.collection.bind(db),async runTransaction(fn){
    stop.check();const intents=new Set();
    try{
      const result=await rpc(()=>db.runTransaction(async tx=>{
        stop.check();const observed=new Map();
        const proxy={get:async ref=>{
          stop.check();const snap=await tx.get(ref);stop.check();
          if(ref.path && typeof snap.exists==='boolean')observed.set(ref.path,snap.exists?snap.data():null);
          else for(const doc of snap.docs || [])observed.set(doc.ref.path,doc.data());
          return snap;
        }};
        for(const method of ['create','set'])proxy[method]=(ref,fields,options)=>{
          stop.check();identity(journal.data,ref.path);
          if(method==='create' && !owns(journal.data,ref.path,fields))throw failure('WRITE_IDENTITY_MISMATCH');
          if(method==='set' && !owns(journal.data,ref.path,observed.get(ref.path)))throw failure('UPDATE_OWNER_UNCONFIRMED');
          if(method==='set' && Object.entries(identity(journal.data,ref.path)).some(([key,value])=>Object.hasOwn(fields,key) && fields[key]!==value))throw failure('WRITE_IDENTITY_MISMATCH');
          journal.intent(ref.path,'transaction.'+method);intents.add(ref.path);return tx[method](ref,fields,options);
        };
        const value=await fn(proxy);stop.check();return value;
      }));
      for(const key of intents)journal.state(key,'transaction_returned');return result;
    }catch(error){stop.abort();if(intents.size)journal.uncertain();journal.issue('run','transaction',null,error);throw error;}
  }};
  return {db:guarded,rpc,async createFixture(key,fields){
    stop.check();if(!Object.hasOwn(fixtureData(journal.data),key) || !owns(journal.data,key,fields))throw failure('FIXTURE_OUTSIDE_RUN');
    const ref=db.doc(key),existing=await rpc(()=>ref.get());
    if(existing.exists){journal.data.documents[key]={attempted:false,state:'collision',operation:'create'};journal.save();throw failure('FIXTURE_ALREADY_EXISTS');}
    journal.intent(key,'create');
    try{await rpc(()=>ref.create(fields));journal.state(key,'acknowledged');}
    catch(error){stop.abort();if(collision(error))journal.state(key,'collision');else{journal.state(key,'uncertain');journal.uncertain();}throw error;}
  }};
}
async function inspectOrCleanup(db,journal,{remove=false,rpcMs=10000}={}){
  assertClient(db);
  const report={verifiedAt:null,complete:true,documents:{}};
  for(const [key,entry]of Object.entries(journal.data.documents)){
    let state;
    try{
      identity(journal.data,key);
      if(!entry.attempted || entry.state==='collision'){
        state=entry.state==='collision'?'collision_not_deleted':'not_dispatched';if(entry.state==='collision')report.complete=false;
      }else{
        const ref=db.doc(key),snap=await deadline(()=>ref.get(),rpcMs);
        if(!snap.exists)state='absent';
        else if(!owns(journal.data,key,snap.data())){state='owner_mismatch_not_deleted';report.complete=false;}
        else if(!remove){state='present_owned';report.complete=false;}
        else{
          if(!snap.updateTime)throw failure('DELETE_PRECONDITION_REQUIRED');
          await deadline(()=>ref.delete({lastUpdateTime:snap.updateTime}),rpcMs);
          const after=await deadline(()=>ref.get(),rpcMs);state=after.exists?'still_present':'deleted_verified';if(after.exists)report.complete=false;
        }
      }
    }catch(error){state='unknown_or_failed';report.complete=false;journal.issue('cleanup',remove?'delete_or_verify':'inspect',key,error);}
    report.documents[key]=state;journal.data.cleanup=report;journal.save();
  }
  // A second read detects reappearance; it cannot rule out a later server commit.
  if(remove)for(const [key,state]of Object.entries(report.documents)){
    if(!['absent','deleted_verified'].includes(state))continue;
    try{if((await deadline(()=>db.doc(key).get(),rpcMs)).exists){report.documents[key]='reappeared';report.complete=false;}}
    catch(error){report.documents[key]='verification_unknown';report.complete=false;journal.issue('cleanup','final_verify',key,error);}
  }
  report.verifiedAt=new Date().toISOString();journal.data.cleanup=report;journal.save();return report;
}
// Bounded parent supervision: wait for writer exit before launching cleanup.
function supervise(spawn,{timeoutMs=30000,graceMs=1500,signal,job,onSpawn}={}){
  return new Promise(resolve=>{
    let child,result,phaseTimer,killTimer,reapTimer,finished=false,timedOut=false,interrupted=false,forced=false;
    const finish=extra=>{if(finished)return;finished=true;clearTimeout(phaseTimer);clearTimeout(killTimer);clearTimeout(reapTimer);signal?.removeEventListener('abort',abort);resolve({result,timedOut,interrupted,forced,pid:child?.pid,...extra});};
    const stop=()=>{
      if(killTimer || finished)return;
      try{if(child.connected)child.send({type:'abort'},()=>{});}catch{}
      killTimer=setTimeout(()=>{
        forced=true;try{child.kill('SIGKILL');}catch{}
        reapTimer=setTimeout(()=>{try{if(child.connected)child.disconnect();}catch{}child.unref();finish({ok:false,unreaped:true});},graceMs);
      },graceMs);
    };
    const abort=()=>{interrupted=true;stop();};
    try{child=spawn();}catch(error){finish({ok:false,error:errorInfo(error)});return;}
    child.on('message',message=>{if(message?.type==='result')result=message.result;});
    child.once('error',error=>{result={ok:false,error:errorInfo(error)};if(child.pid)stop();else finish({ok:false,error:errorInfo(error)});});
    child.once('exit',(code,exitSignal)=>finish({ok:code===0 && result?.ok===true && !timedOut && !interrupted,code,exitSignal}));
    try{onSpawn?.(child.pid);}catch(error){result={ok:false,error:errorInfo(error)};stop();return;}
    phaseTimer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    try{child.send({type:'start',job},error=>{if(error){result={ok:false,error:errorInfo(error)};stop();}});}catch(error){result={ok:false,error:errorInfo(error)};stop();}
  });
}
async function orchestrate(file,{launch,mode='run',signal}={}){
  let journal=openJournal(file);const work=await launch(mode,{signal});journal=openJournal(file);journal.data.worker=work;
  if(work.unreaped){journal.data.status='writer_not_reaped';journal.data.lateWritesPossible=true;journal.save();return {exitCode:3,status:journal.data.status,journal:file,writerPid:work.pid,documents:Object.fromEntries(Object.keys(journal.data.documents).map(key=>[key,'not_verified']))};}
  if(Object.values(journal.data.documents).some(d=>d.attempted && (work.forced || work.timedOut || work.interrupted || (!work.ok && d.state==='in_flight'))))journal.uncertain();
  journal.data.status=work.ok?'assertions_completed':'run_failed';journal.save();
  let cleanup;
  if(Object.keys(journal.data.documents).length){journal.data.lastCleanup=journal.data.cleanup || null;journal.data.cleanup={complete:false,verifiedAt:null,documents:{}};journal.save();cleanup=await launch('cleanup',{});}
  else{journal.data.cleanup={complete:true,verifiedAt:new Date().toISOString(),documents:{}};journal.save();cleanup={ok:true};}
  journal=openJournal(file);journal.data.cleanupWorker=cleanup;
  const complete=cleanup.ok && journal.data.cleanup?.complete===true;
  const status=!complete?'cleanup_incomplete':journal.data.lateWritesPossible?'remote_outcome_uncertain':work.ok?(mode==='probe'?'probe_passed':'passed'):'run_failed';
  journal.data.status=status;journal.data.finishedAt=new Date().toISOString();journal.save();
  return {exitCode:!complete?3:work.timedOut?2:['passed','probe_passed'].includes(status)?0:1,status,mode,journal:file,lateWritesPossible:journal.data.lateWritesPossible,
    verifiedAt:journal.data.cleanup?.verifiedAt || null,cleanupWorker:cleanup,
    documents:Object.fromEntries(Object.keys(journal.data.documents).map(key=>[key,journal.data.cleanup?.documents[key] || 'not_verified'])),errors:journal.data.errors};
}
module.exports={PROJECT,DATABASE,SCHEMA,failure,errorInfo,validateTarget,assertDatabase,idsFor,fixtureData,identity,owns,
  createJournal,openJournal,gate,deadline,guardedDatabase,inspectOrCleanup,supervise,orchestrate};
