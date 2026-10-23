'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const review=require('../web/qr/paper_attendance_review.js');
const paper=require('../web/qr/paper_attendance_scope.js');

const confirmedCells=(values=[])=>review.blankCells().map((cell,index)=>({
  ...cell,confirmed:true,date:values[index]||'',status:values[index]?'recognized':'empty'
}));
const scope={...paper.scope,teacher_id:'T1'};

test('confirmed cells become stable one-record entries and preserve same-day duplicates',()=>{
  const records=review.buildRegistrationRecords(confirmedCells(['9/18','9/18','2026-09-20']),{memberId:'M1',year:2026});
  assert.deepEqual(records.map(row=>[row.attendance_date,row.occurrence,row.key]),[
    ['2026-09-18',1,'M1|2026-09-18|1'],['2026-09-18',2,'M1|2026-09-18|2'],['2026-09-20',1,'M1|2026-09-20|1']
  ]);
});

test('unknown member, unconfirmed cells and invalid dates fail closed',()=>{
  assert.throws(()=>review.buildRegistrationRecords(confirmedCells(['9/18']),{memberId:'',year:2026}),/MEMBER_REQUIRED/);
  const pending=confirmedCells(['9/18']);pending[8].confirmed=false;
  assert.throws(()=>review.buildRegistrationRecords(pending,{memberId:'M1',year:2026}),/CELLS_NOT_CONFIRMED/);
  assert.throws(()=>review.buildRegistrationRecords(confirmedCells(['2/30']),{memberId:'M1',year:2026}),/INVALID_ATTENDANCE_DATE/);
});

test('manual date accepts MMDD without weakening calendar validation',()=>{
  assert.equal(review.normalizeDate('0918'),'9/18');
  assert.equal(review.normalizeDate('１２３１'),'12/31');
  assert.equal(review.fullDate('0918',2026),'2026-09-18');
  assert.equal(review.fullDate('0230',2026),'');
  assert.equal(review.normalizeDate('1331'),'');
});

test('sequential registration rereads state and adds one free slot without cancelling existing slots',async()=>{
  const records=review.buildRegistrationRecords(confirmedCells(['9/18','9/18']),{memberId:'M1',year:2026}),selected=[] ,writes=[];
  const result=await review.registerSequential({records,scope,successfulKeys:new Set(),
    readState:async()=>({selected_slot_ids:selected.slice(),current_rank:'一級',billing_plan_id:'P1'}),
    register:async input=>{writes.push(input);selected.splice(0,selected.length,...input.attendance_items[0].slot_ids);return{ok:true};},
    requestId:record=>'REQ-'+record.cell_index});
  assert.equal(result.success,2);assert.equal(result.failed,0);
  assert.deepEqual(writes.map(input=>input.attendance_items[0].slot_ids),[['PAPER_UNKNOWN_SLOT_1'],['PAPER_UNKNOWN_SLOT_1','PAPER_UNKNOWN_SLOT_2']]);
  assert.ok(writes.every(input=>input.attendance_items.length===1&&input.source==='paper_attendance_review'));
  assert.ok(writes.every(input=>input.skip_billing===true&&input.attendance_items[0].plan_id===''));
});

test('existing attendance and successful retry keys prevent duplicate writes',async()=>{
  const records=review.buildRegistrationRecords(confirmedCells(['9/18','9/18']),{memberId:'M1',year:2026}),successful=new Set([records[0].key]);let writes=0;
  const result=await review.registerSequential({records,scope,successfulKeys:successful,
    readState:async()=>({selected_slot_ids:['S1','S2'],current_rank:'一級',billing_plan_id:'P1'}),
    register:async()=>{writes++;}});
  assert.equal(result.skipped,1);assert.equal(result.duplicate,1);assert.equal(writes,0);
});

test('partial failure reports the failed record and retry skips prior successes',async()=>{
  const records=review.buildRegistrationRecords(confirmedCells(['9/18','','2026-09-20']),{memberId:'M1',year:2026}),successful=new Set(),attempts=new Map();
  const run=()=>review.registerSequential({records,scope,successfulKeys:successful,
    readState:async record=>({selected_slot_ids:successful.has(record.key)?['S1']:[],current_rank:'一級',billing_plan_id:'P1'}),
    register:async(_input,record)=>{attempts.set(record.key,(attempts.get(record.key)||0)+1);if(record.attendance_date==='2026-09-20'&&attempts.get(record.key)===1)throw Error('TEMPORARY');}});
  const first=await run();assert.equal(first.success,1);assert.equal(first.failed,1);
  const second=await run();assert.equal(second.skipped,1);assert.equal(second.success,1);assert.equal(second.failed,0);
  assert.equal(attempts.get(records[0].key),1);assert.equal(attempts.get(records[1].key),2);
});

test('screen uses the existing normal attendance action and exposes preview/result controls',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../web/qr/paper_attendance_review.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../web/qr/paper_attendance_review.js'),'utf8');
  for(const id of ['registrationMember','registrationYear','prepareRegistrationButton','executeRegistrationButton','registrationResult'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/attendance_firebase_read\.js/);
  assert.match(html,/paper_attendance_scope\.js/);
  assert.match(js,/paperRuntimeConfig\(\)/);
  assert.match(js,/attendance_saved_state/);
  assert.match(js,/attendance_member_options/);
  assert.doesNotMatch(js,/attendance_session_info/);
  assert.doesNotMatch(js,/member_attendance_state/);
  assert.match(js,/DOJO_PAPER_ATTENDANCE_SCOPE/);
  assert.match(js,/paperAttendance\?\.apiBaseUrl/);
  assert.match(js,/runtimeConfig=paperRuntimeConfig\(\)/);
  assert.doesNotMatch(js,/registrationRead\("qr_generator_options"\)/);
  assert.match(js,/DOJO_ATTENDANCE_FIREBASE_WRITE\.register/);
  assert.doesNotMatch(js,/runtimeConfig=root\.DOJO_RUNTIME_CONFIG/);
});

test('paper-only unknown masters preserve same-day occurrences without enabling billing',()=>{
  assert.equal(paper.masters.dojo.location_id,paper.scope.location_id);
  assert.equal(paper.masters.dojo.display_name,'道場不明');
  assert.equal(paper.masters.billing_block.location_id,paper.scope.location_id);
  assert.equal(paper.masters.billing_block.billing_block_id,paper.scope.billing_block_id);
  assert.equal(paper.masters.billing_block.slots_per_charge,8);
  assert.equal(paper.masters.billing_block.maximum_training_slots,8);
  assert.equal(paper.masters.training_slots.length,8);
  assert.deepEqual(paper.masters.training_slots.map(row=>row.slot_id),Array.from({length:8},(_,index)=>'PAPER_UNKNOWN_SLOT_'+(index+1)));
  assert.equal(new Set(paper.masters.training_slots.map(row=>row.slot_id)).size,8);
  assert.ok(paper.masters.training_slots.every(row=>row.location_id===paper.scope.location_id&&row.billing_block_id===paper.scope.billing_block_id));
  assert.ok(paper.masters.training_slots.every(row=>row.display_name==='稽古枠不明'&&row.duration_minutes===60&&row.billing_allowed===false&&row.status==='有効'));
});

function progressBody(minutes){return{ok:true,attendance_by_date:minutes>0?[{attendance_date:'2026-09-18',training_minutes:minutes}]:[]};}
async function runDifference({confirmedMinutes=0,desiredHours=3,selected=[],failTarget=0,successfulKeys=new Set()}={}){
  let minutes=confirmedMinutes,failOnce=failTarget,writes=0,progressReads=0;
  const selectedSlots=selected.slice(),requests=[];
  const result=await review.registerDifferencePlan({desiredCells:confirmedCells(Array(desiredHours).fill('9/18')),memberId:'M1',year:2026,scope,successfulKeys,
    readProgress:async()=>{progressReads++;return progressBody(minutes);},
    readState:async()=>({selected_slot_ids:selectedSlots.slice(),current_rank:'一級'}),
    register:async(input,record)=>{writes++;requests.push({input,record});if(record.targetMinutes===failOnce){failOnce=0;throw Error('TEMPORARY');}selectedSlots.splice(0,selectedSlots.length,...input.attendance_items[0].slot_ids);minutes+=60;},
    requestId:record=>'REQ-'+record.attendance_date+'-'+record.targetMinutes});
  return{result,writes,requests,minutes,selectedSlots,progressReads,successfulKeys};
}

test('difference registration writes only missing 60-minute units for 0→3H and 2→3H',async()=>{
  const zero=await runDifference({confirmedMinutes:0,desiredHours:3});
  assert.equal(zero.result.success,3);assert.equal(zero.writes,3);assert.equal(zero.minutes,180);
  assert.deepEqual(zero.requests.map(row=>row.input.attendance_items[0].slot_ids),[
    ['PAPER_UNKNOWN_SLOT_1'],['PAPER_UNKNOWN_SLOT_1','PAPER_UNKNOWN_SLOT_2'],['PAPER_UNKNOWN_SLOT_1','PAPER_UNKNOWN_SLOT_2','PAPER_UNKNOWN_SLOT_3']
  ]);
  const two=await runDifference({confirmedMinutes:120,desiredHours:3,selected:['PAPER_UNKNOWN_SLOT_1','PAPER_UNKNOWN_SLOT_2']});
  assert.equal(two.result.success,1);assert.equal(two.writes,1);assert.deepEqual(two.selectedSlots,['PAPER_UNKNOWN_SLOT_1','PAPER_UNKNOWN_SLOT_2','PAPER_UNKNOWN_SLOT_3']);
});

test('difference registration makes no attendance write for equal or greater confirmed time',async()=>{
  const equal=await runDifference({confirmedMinutes:180,desiredHours:3}),greater=await runDifference({confirmedMinutes:240,desiredHours:3});
  assert.equal(equal.writes,0);assert.equal(greater.writes,0);
  assert.equal(equal.progressReads,1);assert.equal(greater.progressReads,1);
});

test('difference registration supports exactly eight paper slots and rejects over eight hours',async()=>{
  const eight=await runDifference({confirmedMinutes:0,desiredHours:8});
  assert.equal(eight.result.success,8);assert.equal(eight.selectedSlots.length,8);assert.equal(eight.minutes,480);
  let writes=0;await assert.rejects(()=>review.registerDifferencePlan({desiredCells:confirmedCells(Array(9).fill('9/18')),memberId:'M1',year:2026,scope,readProgress:async()=>progressBody(0),readState:async()=>({selected_slot_ids:[]}),register:async()=>{writes++;}}),/DAILY_TRAINING_LIMIT_EXCEEDED/);assert.equal(writes,0);
});

test('fractional confirmed-time gaps and unconfirmed OCR never write automatically',async()=>{
  for(const minutes of[30,90]){let writes=0;await assert.rejects(()=>review.registerDifferencePlan({desiredCells:confirmedCells(Array(3).fill('9/18')),memberId:'M1',year:2026,scope,readProgress:async()=>progressBody(minutes),readState:async()=>({selected_slot_ids:[]}),register:async()=>{writes++;}}),/DIFFERENCE_REQUIRES_REVIEW/);assert.equal(writes,0);}
  const pending=confirmedCells(['9/18']);pending[0].confirmed=false;await assert.rejects(()=>review.registerDifferencePlan({desiredCells:pending,memberId:'M1',year:2026,scope,readProgress:async()=>progressBody(0),readState:async()=>({selected_slot_ids:[]}),register:async()=>{throw Error('MUST_NOT_WRITE');}}),/CELLS_NOT_CONFIRMED/);
});

test('registration rereads confirmed time before every write and preserves all existing paper slots',async()=>{
  const run=await runDifference({confirmedMinutes:120,desiredHours:3,selected:['PAPER_UNKNOWN_SLOT_1','PAPER_UNKNOWN_SLOT_2']});
  assert.ok(run.progressReads>=2);assert.deepEqual(run.requests[0].input.attendance_items[0].slot_ids,['PAPER_UNKNOWN_SLOT_1','PAPER_UNKNOWN_SLOT_2','PAPER_UNKNOWN_SLOT_3']);
  assert.equal(run.requests[0].input.skip_billing,true);assert.equal(run.requests[0].input.source,'paper_attendance_review');
});

test('partial failure retry continues from latest confirmed time without duplicating successes',async()=>{
  const first=await runDifference({confirmedMinutes:0,desiredHours:3,failTarget:120});
  assert.equal(first.result.success,1);assert.equal(first.result.failed,1);assert.equal(first.minutes,60);
  const second=await runDifference({confirmedMinutes:first.minutes,desiredHours:3,selected:first.selectedSlots,successfulKeys:first.successfulKeys});
  assert.equal(second.result.success,2);assert.equal(second.writes,2);assert.equal(second.minutes,180);
});

test('a locally successful but not-yet-visible target is not sent twice',async()=>{
  const key='M1|2026-09-18|target:60',run=await runDifference({confirmedMinutes:0,desiredHours:1,successfulKeys:new Set([key])});
  assert.equal(run.writes,0);assert.equal(run.result.skipped,1);assert.equal(run.result.items[0].status,'awaiting_confirmation');
});

test('DEV target scopes every paper attendance request to the candidate without changing the shared API URL',()=>{
  const target=JSON.parse(fs.readFileSync(path.join(__dirname,'../targets/dev-firebase.json'),'utf8'));
  assert.equal(target.apiBaseUrl,'https://dojo-time-travel-admin-374758850136.asia-northeast1.run.app');
  assert.equal(target.paperAttendance.apiBaseUrl,'https://candidate---dojo-time-travel-admin-q6ujypei6a-an.a.run.app');
});
