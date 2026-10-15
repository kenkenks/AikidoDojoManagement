'use strict';
// Opt-in controller. Parent never loads a Firestore SDK or opens a connection.
const path=require('node:path'),{fork}=require('node:child_process');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const safety=require('./fw001-firestore-safety.cjs');
function parse(args){
  const options={mode:'run',timeoutMs:30000,cleanupMs:30000,rpcMs:10000,graceMs:1500},flags=new Set();
  for(let i=0;i<args.length;i++){
    const arg=args[i];if(flags.has(arg))throw safety.failure('DUPLICATE_OPTION');flags.add(arg);
    if(arg==='--confirm-development')options.confirm=true;
    else if(arg==='--confirm-writer-stopped')options.writerStopped=true;
    else if(['--probe','--inspect','--recover'].includes(arg)){
      if(options.mode!=='run')throw safety.failure('CONFLICTING_MODES');options.mode=arg.slice(2);
    }else if(arg==='--journal'){
      options.journal=args[++i];if(!options.journal || options.journal.startsWith('--'))throw safety.failure('JOURNAL_REQUIRED');
    }else if(['--timeout-ms','--cleanup-timeout-ms','--rpc-timeout-ms','--stop-grace-ms'].includes(arg)){
      const value=Number(args[++i]);if(!Number.isInteger(value)||value<100||value>300000)throw safety.failure('INVALID_TIMEOUT');
      options[{'--timeout-ms':'timeoutMs','--cleanup-timeout-ms':'cleanupMs','--rpc-timeout-ms':'rpcMs','--stop-grace-ms':'graceMs'}[arg]]=value;
    }else throw safety.failure('UNKNOWN_OPTION');
  }
  if(!options.confirm)throw safety.failure('CONFIRM_DEVELOPMENT_REQUIRED');
  if(['inspect','recover'].includes(options.mode)!==Boolean(options.journal))throw safety.failure('JOURNAL_MODE_MISMATCH');
  if(options.mode==='recover' && !options.writerStopped)throw safety.failure('WRITER_STOP_CONFIRMATION_REQUIRED');
  return options;
}
function sdk(name){return require(require.resolve(name,{paths:[process.env.FW001_DEPENDENCY_ROOT || path.resolve(__dirname,'..')]}));}
async function roundTrip(db,journal,stop,{rpcMs=10000,probe=false}={}){
  const time=require('../shared/TimeTravel.js'),access=safety.guardedDatabase(db,journal,stop,{rpcMs}),settings={};
  for(const key of ['TIME_TRAVEL_ENABLED','DEBUG_DATE','DEBUG_TARGET_MONTH','DEBUG']){
    const doc=await access.rpc(()=>db.collection('settings').doc(key).get());if(doc.exists)settings[key]=doc.data().value;
  }
  if(probe)return;
  const context={settings,timezone:'Asia/Tokyo',clock:()=>new Date()},date=time.today(context),month=time.targetMonth(context);
  journal.data.month=month;journal.data.date=date;journal.data.status='running';journal.save();
  for(const [key,fields]of Object.entries(safety.fixtureData(journal.data)))await access.createFixture(key,fields);
  const {createAttendanceCore}=require('../adapters/firestore/DAO_Core.js');
  const {createAttendanceRegistrationTarget}=require('../cloud/time-travel/target.cjs');
  const core=createAttendanceCore(access.db,{createRegistration:createAttendanceRegistrationTarget,
    uuid:()=>journal.data.prefix+'_'+randomUUID().replace(/-/g,'')});
  const i=journal.data.ids,input={teacher_id:i.teacher,location_id:i.dojo,billing_block_id:i.block,attendance_date:date,
    attendance_session_id:journal.data.prefix+'_SESSION',attendance_items:[{member_id:i.member,slot_ids:[i.slot],plan_id:i.plan,current_rank:'初段'}]};
  const first=await core.register(input);assert.equal(first.ok,true);assert.equal(first.registered_count,1);
  const second=await core.register(input);assert.equal(second.ok,true);assert.equal(second.retained_count,1);
  const saved=await access.rpc(()=>db.collection('attendances').where('member_id','==',i.member).get());
  assert.equal(saved.docs.length,1);assert.equal(saved.docs[0].data()['状態'],'有効');
  const invoices=await access.rpc(()=>db.collection('invoices').where('member_id','==',i.member).get());
  assert.equal(invoices.docs.length,1);assert.equal(invoices.docs[0].data()['請求予定額'],1000);
  const member=await access.rpc(()=>db.doc('members/'+i.member).get());assert.equal(member.data().current_rank,'初段');
  const {monthlySelectionDocumentId}=require('../cloud/attendance/monthly-selection-key.cjs');
  const view=await access.rpc(()=>db.doc('payment_status_views/view_'+monthlySelectionDocumentId(i.member,month)).get());
  assert.equal(view.data()['請求額'],1000);assert.equal(JSON.parse(view.data().attendance_items_json).length,1);
  const cleared=await core.register({...input,attendance_items:[{...input.attendance_items[0],slot_ids:[]}]});
  assert.equal(cleared.ok,true);assert.equal(cleared.cancelled_count,1);
  journal.data.assertionsPassed=true;journal.save();
}
async function worker(job,stop,{connect}={}){
  const journal=safety.openJournal(job.journal),profile=require('../targets/dev-firebase.json');safety.validateTarget(profile);
  let db,app,deleteApp,result;
  try{
    if(connect)({db,app,deleteApp}=await connect());
    else{
      const sdkApp=sdk('firebase-admin/app');deleteApp=sdkApp.deleteApp;
      app=sdkApp.initializeApp({projectId:safety.PROJECT,credential:sdkApp.applicationDefault()},'fw001-'+journal.data.prefix);
      db=sdk('firebase-admin/firestore').getFirestore(app,safety.DATABASE);db.settings({preferRest:true});
    }
    safety.assertDatabase(db,app);stop.check();
    if(job.mode==='run' || job.mode==='probe')await roundTrip(db,journal,stop,{rpcMs:job.rpcMs,probe:job.mode==='probe'});
    else{
      const report=await safety.inspectOrCleanup(db,journal,{remove:job.mode==='cleanup' || job.mode==='recover',rpcMs:job.rpcMs});
      if(!report.complete && job.mode!=='inspect')throw safety.failure('CLEANUP_INCOMPLETE');
    }
    result={ok:true};
  }catch(error){result={ok:false,error:safety.errorInfo(error)};journal.issue(job.mode,'worker',null,error);}
  finally{
    for(const [label,close]of [['terminate',db&&(()=>db.terminate())],['deleteApp',app&&deleteApp&&(()=>deleteApp(app))]]){
      if(!close)continue;
      try{await safety.deadline(close,job.graceMs || 1500,'SDK_SHUTDOWN_TIMEOUT');}
      catch(error){result={ok:false,error:safety.errorInfo(error)};journal.issue(job.mode,label,null,error);}
    }
  }
  return result;
}
async function controller(args,{launch:injectedLaunch,env=process.env,signal,log=console.log}={}){
  const options=parse(args),profile=require('../targets/dev-firebase.json');safety.validateTarget(profile,env);
  let journal=options.journal?safety.openJournal(options.journal):safety.createJournal(path.join(__dirname,'fw001-firestore-runs'));
  log(JSON.stringify({event:'FW001_JOURNAL',project:safety.PROJECT,database:safety.DATABASE,journal:journal.file,run:journal.data.prefix}));
  const launch=injectedLaunch || ((mode,{signal:workerSignal}={})=>safety.supervise(
    ()=>fork(__filename,['--worker',journal.file],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true}),
    {timeoutMs:['cleanup','inspect','recover'].includes(mode)?options.cleanupMs:options.timeoutMs,
      graceMs:options.graceMs,signal:workerSignal,
      onSpawn:pid=>{const current=safety.openJournal(journal.file);current.data.activeWorker={pid,mode,startedAt:new Date().toISOString()};current.data.workers=[...(current.data.workers || []),current.data.activeWorker];current.save();},
      job:{mode,journal:journal.file,rpcMs:options.rpcMs,graceMs:options.graceMs}}));
  let result;
  if(['run','probe'].includes(options.mode))result=await safety.orchestrate(journal.file,{launch,mode:options.mode,signal});
  else{
    journal.data.lastCleanup=journal.data.cleanup || null;journal.data.cleanup={complete:false,verifiedAt:null,documents:{}};journal.save();
    const outcome=await launch(options.mode,{});journal=safety.openJournal(journal.file);
    const verified=outcome.ok && journal.data.cleanup?.complete===true;
    const uncertain=verified && journal.data.lateWritesPossible;
    const status=options.mode==='inspect'?(outcome.ok?(uncertain?'inspection_verified_remote_uncertain':'inspection_completed'):'inspection_incomplete'):
      verified?(uncertain?'recovery_verified_remote_uncertain':'recovered_verified_now'):'recovery_incomplete';
    if(options.mode==='recover'){journal.data.status=status;journal.data.recoveryWorker=outcome;journal.save();}
    result={exitCode:verified?(uncertain?1:0):3,status,journal:journal.file,lateWritesPossible:journal.data.lateWritesPossible,
      verifiedAt:journal.data.cleanup?.verifiedAt || null,inspectionWorker:outcome,
      documents:Object.fromEntries(Object.keys(journal.data.documents).map(key=>[key,journal.data.cleanup?.documents[key] || 'not_verified'])),errors:journal.data.errors};
  }
  log(JSON.stringify({event:'FW001_RESULT',...result}));return result;
}
async function entry(){
  if(process.argv[2]==='--worker' && typeof process.send==='function'){
    process.env.TZ='Asia/Tokyo';const stop=safety.gate();let started=false;
    const orphan=()=>stop.abort();process.once('disconnect',orphan);
    const receive=async message=>{
      if(message?.type==='abort'){stop.abort();return;}
      if(message?.type!=='start' || started)return;started=true;
      let result;try{
        if(path.resolve(message.job.journal)!==path.resolve(process.argv[3] || ''))throw safety.failure('WORKER_JOURNAL_MISMATCH');
        result=await worker(message.job,stop);
      }catch(error){result={ok:false,error:safety.errorInfo(error)};}
      process.exitCode=result.ok?0:1;process.removeListener('message',receive);
      process.removeListener('disconnect',orphan);
      if(process.connected)process.send({type:'result',result},()=>process.disconnect());
    };
    process.on('message',receive);return;
  }
  const abort=new AbortController(),interrupt=()=>abort.abort();process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  try{process.exitCode=(await controller(process.argv.slice(2),{signal:abort.signal})).exitCode;}
  catch(error){console.error(JSON.stringify({event:'FW001_FATAL',...safety.errorInfo(error)}));process.exitCode=1;}
  finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
}
if(require.main===module)entry().catch(error=>{console.error(JSON.stringify({event:'FW001_FATAL',...safety.errorInfo(error)}));process.exitCode=1;});
module.exports={parse,roundTrip,worker,controller};
