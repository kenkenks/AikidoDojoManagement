'use strict';
// Local staged-test helpers: no SDK, HTTP server, credentials or automatic execution.
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const S=require('./fw001-firestore-safety.cjs');
const {monthlySelectionDocumentId}=require('../cloud/attendance/monthly-selection-key.cjs');
const URL='https://candidate---dojo-time-travel-admin-q6ujypei6a-an.a.run.app';
const REVISION='dojo-time-travel-admin-00039-pex';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=input=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
function timeout(value){if(!Number.isInteger(value)||value<1||value>300000)throw S.failure('INVALID_CANDIDATE_TIMEOUT');}
function check(db,journal){
  S.assertDatabase(db,{options:{projectId:S.PROJECT}});S.validateJournal(journal.data);
  if(journal.data.candidate?.mode!=='staged')throw S.failure('STAGED_JOURNAL_REQUIRED');
}
// Reload disk under an exclusive lock; never trust a caller-held state snapshot.
async function locked(db,source,fn){
  const file=typeof source==='string'?source:source.file,lock=file+'.lock';let fd;
  try{fd=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw S.failure('JOURNAL_LOCKED');throw error;}
  try{return await fn(S.openJournal(file));}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
function saveVerified(journal){
  const expected=JSON.stringify(journal.data);journal.save();
  if(JSON.stringify(S.openJournal(journal.file).data)!==expected)throw S.failure('JOURNAL_READBACK_MISMATCH');
}
function configure(journal,{date,month}){
  const lock=journal.file+'.lock',fd=fs.openSync(lock,'wx',0o600);
  try{
    if(JSON.stringify(S.openJournal(journal.file).data)!==JSON.stringify(journal.data))throw S.failure('STALE_JOURNAL');
    if(journal.data.candidate || Object.keys(journal.data.documents).length)throw S.failure('FRESH_JOURNAL_REQUIRED');
    journal.data.date=date;journal.data.month=month;
    journal.data.candidate={mode:'staged',url:URL,revision:REVISION,baseline:false,step:0,verifiedStep:0,
      stopped:false,pending:false,operations:[]};
    saveVerified(journal);return journal;
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
async function inventory(db,journal,{rpcMs=10000}={}){
  check(db,journal);timeout(rpcMs);const j=journal.data,i=j.ids,found=new Map();
  const get=fn=>S.deadline(fn,rpcMs);
  for(const key of [...Object.keys(S.fixtureData(j)),
    'monthly_selections/'+monthlySelectionDocumentId(i.group,j.month),
    'payment_status_views/view_'+monthlySelectionDocumentId(i.member,j.month)]){
    const snap=await get(()=>db.doc(key).get());if(snap.exists)found.set(key,snap);
  }
  for(const [collection,field,value]of [['attendances','member_id',i.member],
    ['attendances','attendance_session_id',j.prefix+'_SESSION'],
    ['invoices','billing_group_id',i.group],['invoices','member_id',i.member]]){
    const result=await get(()=>db.collection(collection).where(field,'==',value).limit(501).get());
    if(result.docs.length>500)throw S.failure('CANDIDATE_SCOPE_LIMIT');
    for(const snap of result.docs){
      if(!snap.ref?.path?.startsWith(collection+'/') || snap.ref.path.split('/').length!==2)throw S.failure('INVALID_DISCOVERY_PATH');
      found.set(snap.ref.path,snap);
    }
  }
  return found;
}
async function preflight(db,source,options){return locked(db,source,async journal=>{
  check(db,journal);const c=journal.data.candidate;
  if(c.baseline || c.step || c.pending || Object.keys(journal.data.documents).length)throw S.failure('FRESH_BASELINE_REQUIRED');
  if((await inventory(db,journal,options)).size)throw S.failure('CANDIDATE_FIXTURE_COLLISION');
  c.baseline=true;saveVerified(journal);
});}
async function discoverInto(db,journal,options){
  check(db,journal);const c=journal.data.candidate;
  if(!c.baseline)throw S.failure('BASELINE_REQUIRED');
  const found=await inventory(db,journal,options);
  try{for(const [key,snap]of found)if(!S.owns(journal.data,key,snap.data()))throw S.failure('CANDIDATE_OWNER_MISMATCH');}
  catch{
    c.stopped=true;journal.issue('candidate','inventory',null,S.failure('CANDIDATE_OWNER_MISMATCH'));
    throw S.failure('CANDIDATE_OWNER_MISMATCH');
  }
  for(const [key]of found){
    if(!journal.data.documents[key] && !c.step && !c.pending)throw S.failure('UNEXPECTED_PRE_DISPATCH_DOCUMENT');
    if(!journal.data.documents[key])journal.data.documents[key]={attempted:true,state:'discovered',operation:'candidate.inventory'};
  }
  saveVerified(journal);return [...found.keys()];
}
async function discover(db,source,options){return locked(db,source,journal=>discoverInto(db,journal,options));}
async function fixturesReady(db,journal,rpcMs){
  for(const key of Object.keys(S.fixtureData(journal.data))){
    const entry=journal.data.documents[key];
    if(entry?.attempted!==true || entry.operation!=='create' || entry.state!=='acknowledged')throw S.failure('FIXTURES_NOT_ACKNOWLEDGED');
    const snap=await S.deadline(()=>db.doc(key).get(),rpcMs);
    if(!snap.exists || !S.owns(journal.data,key,snap.data()))throw S.failure('FIXTURES_NOT_OWNED');
  }
}
async function createFixtures(db,source,{rpcMs=10000}={}){return locked(db,source,async journal=>{
  check(db,journal);timeout(rpcMs);const c=journal.data.candidate;
  if(!c.baseline || c.stopped || c.pending || c.operations.length || journal.data.lateWritesPossible ||
      Object.keys(journal.data.documents).length)throw S.failure('FRESH_FIXTURE_STAGE_REQUIRED');
  const access=S.guardedDatabase(db,journal,S.gate(),{rpcMs});
  try{
    for(const [key,row]of Object.entries(S.fixtureData(journal.data)))await access.createFixture(key,row);
    await fixturesReady(db,journal,rpcMs);saveVerified(journal);
  }catch{c.stopped=true;journal.issue('candidate','fixtures',null,S.failure('CANDIDATE_FIXTURES_FAILED'));throw S.failure('CANDIDATE_FIXTURES_FAILED');}
});}
function inputFor(j,kind){const i=j.ids;return {teacher_id:i.teacher,location_id:i.dojo,billing_block_id:i.block,
  attendance_date:j.date,attendance_session_id:j.prefix+'_SESSION',
  attendance_items:[{member_id:i.member,slot_ids:kind==='cancel'?[]:[i.slot],plan_id:i.plan,current_rank:'初段'}]};}
function browserCode(op){
  return `(async () => {
  const op = ${JSON.stringify(op)};
  if (location.origin !== 'https://dojo-management-dev.web.app' ||
      location.pathname !== '/qr/qr_generator.html' || new URLSearchParams(location.search).get('qr_candidate') !== '1' ||
      typeof dojoApiClient === 'undefined' || typeof RUNTIME_CONFIG === 'undefined' ||
      RUNTIME_CONFIG.target !== 'dev-firebase' || RUNTIME_CONFIG.firebase.projectId !== 'dojo-management-dev')
    throw new Error('FW001_BROWSER_CONTEXT_REQUIRED');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(op.input)));
  if (Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('') !== op.inputHash)
    throw new Error('FW001_INPUT_HASH_MISMATCH');
  const key = Symbol.for('FW001.staged.used');
  const used = window[key] || (window[key] = new Set());
  const once = op.testId + ':' + op.number;
  if (used.has(once)) throw new Error('FW001_OPERATION_ALREADY_USED');
  used.add(once);
  const report = {testId:op.testId, number:op.number, kind:op.kind, url:op.url,
    inputHash:op.inputHash, outcome:'unknown', status:null, matched:false, readbackStatus:null, readbackMatched:false};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const expected = {register:'registered_count',repeat:'retained_count',cancel:'cancelled_count'}[op.kind];
    const response = await dojoApiClient.request(op.url + '/api/webconnect', {method:'POST', redirect:'error',
      signal:controller.signal, headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'attendance_batch',input:op.input})});
    report.status = response.status;
    if (response.status === 200) {
      const body = await response.json();
      if (body?.ok === true && body[expected] === 1 && !body.results?.some(row => row.errors?.length)) {
        report.outcome = 'confirmed'; report.matched = true;
        const item = op.input.attendance_items[0];
        const params = new URLSearchParams({action:'member_attendance_state',member_id:item.member_id,
          location_id:op.input.location_id,billing_block_id:op.input.billing_block_id,attendance_date:op.input.attendance_date});
        const read = await dojoApiClient.request(op.url + '/api/webconnect?' + params, {method:'GET',redirect:'error',signal:controller.signal});
        report.readbackStatus = read.status;
        if (read.status === 200) {
          const state = await read.json();
          report.readbackMatched = state?.ok === true && state.member_id === item.member_id && state.current_rank === '初段' &&
            state.billing_plan_selected === true && state.billing_plan_id === item.plan_id &&
            JSON.stringify(state.selected_slot_ids) === JSON.stringify(item.slot_ids);
        }
      }
    }
  } catch { /* Never print exceptions, headers, tokens or bodies. */ }
  finally { clearTimeout(timer); }
  console.log(JSON.stringify(report));
})();`;
}
async function prepareOperation(db,source,kind,{rpcMs=10000}={}){return locked(db,source,async journal=>{
  check(db,journal);timeout(rpcMs);const j=journal.data,c=j.candidate;
  if(!c.baseline || c.stopped || c.pending || j.lateWritesPossible || c.step!==c.verifiedStep || c.operations.length!==c.step)
    throw S.failure('CANDIDATE_SEND_BLOCKED');
  if(kind!==['register','repeat','cancel'][c.step])throw S.failure('CANDIDATE_SEQUENCE_REQUIRED');
  await fixturesReady(db,journal,rpcMs);
  const input=inputFor(j,kind),op={testId:j.prefix,number:c.step+1,kind,url:URL,revision:REVISION,inputHash:hash(input),input,outcome:'issued'};
  c.operations.push(op);c.pending=true;j.lateWritesPossible=true;
  saveVerified(journal);
  return {testId:op.testId,number:op.number,inputHash:op.inputHash,code:browserCode(op)};
});}
function reportMatches(op,report){
  const keys=['testId','number','kind','url','inputHash','outcome','status','matched','readbackStatus','readbackMatched'];
  return report && Object.keys(report).length===keys.length && keys.every(key=>Object.hasOwn(report,key)) &&
    ['testId','number','kind','url','inputHash'].every(key=>report[key]===op[key]) &&
    ['confirmed','unknown'].includes(report.outcome) && typeof report.matched==='boolean' && typeof report.readbackMatched==='boolean' &&
    [report.status,report.readbackStatus].every(status=>status===null || Number.isInteger(status)&&status>=100&&status<=599);
}
async function verifyFacts(db,journal,rpcMs){
  await discoverInto(db,journal,{rpcMs});const j=journal.data,i=j.ids,c=j.candidate,rows=await inventory(db,journal,{rpcMs});
  for(const [key,snap]of rows)if(!S.owns(j,key,snap.data()))throw S.failure('CANDIDATE_OWNER_MISMATCH');
  const attendance=[...rows].filter(([key])=>key.startsWith('attendances/'));
  const invoices=[...rows].filter(([key])=>key.startsWith('invoices/'));
  const view=rows.get('payment_status_views/view_'+monthlySelectionDocumentId(i.member,j.month));
  if(attendance.length!==1 || invoices.length!==1 || invoices[0][1].data()['請求予定額']!==1000 ||
      attendance[0][1].data()['状態']!==(c.step===3?'取消':'有効') || view?.data()['請求額']!==1000 ||
      rows.get('members/'+i.member)?.data().current_rank!=='初段')throw S.failure('CANDIDATE_FACTS_MISMATCH');
}
async function confirmOperation(db,source,report,{rpcMs=10000}={}){return locked(db,source,async journal=>{
  check(db,journal);timeout(rpcMs);const j=journal.data,c=j.candidate,op=c.operations.at(-1);
  if(!c.pending || c.stopped || op?.outcome!=='issued')throw S.failure('CANDIDATE_CONFIRM_BLOCKED');
  if(!reportMatches(op,report) || hash(op.input)!==op.inputHash)throw S.failure('CANDIDATE_REPORT_MISMATCH');
  if(report.outcome!=='confirmed' || report.status!==200 || report.matched!==true){
    op.outcome='unknown';c.stopped=true;saveVerified(journal);
    return {status:'remote_outcome_uncertain',matched:false};
  }
  // Evidence is transferred by the sole operator; it is not a signed server receipt.
  op.outcome='confirmed';op.httpStatus=200;c.pending=false;j.lateWritesPossible=false;c.step++;
  saveVerified(journal);
  try{
    if(report.readbackStatus!==200 || report.readbackMatched!==true)throw S.failure('CANDIDATE_READBACK_FAILED');
    await fixturesReady(db,journal,rpcMs);await verifyFacts(db,journal,rpcMs);
    c.verifiedStep=c.step;saveVerified(journal);return {status:'verified',matched:true};
  }catch{
    c.stopped=true;journal.issue('candidate','verify',null,S.failure('CANDIDATE_VERIFICATION_FAILED'));
    return {status:'verification_failed',matched:false};
  }
});}
async function recover(db,source,{rounds=2,delayMs=1000,wait=pause,rpcMs=10000,...unsupported}={}){return locked(db,source,async journal=>{
  check(db,journal);timeout(rpcMs);
  if(Object.keys(unsupported).length)throw S.failure('UNSUPPORTED_RECOVERY_OPTION');
  if(!Number.isInteger(rounds)||rounds<2||rounds>5||!Number.isFinite(delayMs)||delayMs<1||delayMs>60000)throw S.failure('INVALID_RESCAN_BOUNDS');
  const j=journal.data,c=j.candidate;c.stopped=true;saveVerified(journal);
  if(c.pending || j.lateWritesPossible || c.operations.some(op=>op.outcome!=='confirmed')){
    await discoverInto(db,journal,{rpcMs});
    const report=await S.inspectOrCleanup(db,journal,{remove:false,rpcMs});
    j.status='remote_outcome_uncertain';saveVerified(journal);
    return {status:j.status,readOnly:true,complete:false,documents:report.documents};
  }
  for(let round=0;round<rounds;round++){
    if(round)await wait(delayMs);
    await discoverInto(db,journal,{rpcMs});
    const report=await S.inspectOrCleanup(db,journal,{remove:true,rpcMs});
    if(!report.complete){j.status='cleanup_incomplete';saveVerified(journal);return {status:j.status,complete:false};}
  }
  await wait(delayMs);const remaining=await discoverInto(db,journal,{rpcMs});
  const report=await S.inspectOrCleanup(db,journal,{remove:false,rpcMs});
  const complete=remaining.length===0 && report.complete;
  j.status=!complete?'cleanup_incomplete':c.step===3&&c.verifiedStep===3?'passed':'verification_incomplete';
  saveVerified(journal);return {status:j.status,complete,documents:report.documents};
});}
module.exports={URL,REVISION,configure,preflight,createFixtures,discover,prepareOperation,confirmOperation,recover};
