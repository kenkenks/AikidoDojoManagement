'use strict';
process.env.TZ='Asia/Tokyo';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createAttendanceCore,validateAttendanceInput}=require('../adapters/firestore/DAO_Core.js');
const {createAttendanceRegistrationTarget}=require('../cloud/time-travel/target.cjs');
const {createAttendanceSavedState}=require('../cloud/attendance/saved-state.cjs');
const {createAdminApi}=require('../cloud/api/admin-api.cjs');
const {createDispatch}=require('../cloud/api/webConnect.cjs');
const {monthlySelectionDocumentId}=require('../cloud/attendance/monthly-selection-key.cjs');
const {projectAttendanceProgress}=require('../cloud/attendance/progress-summary.cjs');

// Optimistic transaction double: validate the snapshot version and rerun on
// concurrent commit; never publish failed or partially staged transactions.
function memoryFirestore(seed) {
  let records=new Map(Object.entries(structuredClone(seed))),version=0;
  const events=[];
  const collection=name=>({name,where(field,op,value){return query(name,[[field,op,value]]);},
    limit(n){return query(name,[],n);},doc(id){return {path:name+'/'+id,id};}});
  const query=(name,filters,limit=501)=>({name,filters,limitValue:limit,
    where(field,op,value){return query(name,[...filters,[field,op,value]],limit);},limit(n){return query(name,filters,n);}});
  const snapshot=(key,data)=>({id:key.split('/').at(-1),ref:{path:key,id:key.split('/').at(-1)},exists:data!==undefined,data:()=>structuredClone(data)});
  return {collection,events,records:()=>Object.fromEntries(records),
    async runTransaction(fn) {
      for(let retry=0;retry<20;retry++) {
        const start=version,view=new Map(records),writes=[];
        let wrote=false;
        const tx={async get(ref){assert.equal(wrote,false,'all transaction reads precede writes');
          if(ref.path)return snapshot(ref.path,view.get(ref.path));
          return {docs:[...view].filter(([key,data])=>key.startsWith(ref.name+'/') &&
            (ref.filters||[]).every(([field,op,value])=>op==='=='&&data[field]===value)).slice(0,ref.limitValue)
            .map(([key,data])=>snapshot(key,data))};},
          create(ref,data){wrote=true;writes.push({ref,data:structuredClone(data),create:true});},
          set(ref,data,options){wrote=true;assert.equal(options.merge,true);writes.push({ref,data:structuredClone(data)});}};
        const result=await fn(tx);
        if(start!==version){events.push('retry');continue;}
        for(const write of writes) if(write.create && records.has(write.ref.path))throw Error('ALREADY_EXISTS');
        const next=new Map(records);
        for(const write of writes) next.set(write.ref.path,{...next.get(write.ref.path),...write.data});
        if(writes.length){records=next;version++;events.push('commit');}
        return result;
      }
      throw Error('RETRY_LIMIT');
    }};
}
function seed(plan='回数料金') {
  return {
    'settings/TIME_TRAVEL_ENABLED':{key:'TIME_TRAVEL_ENABLED',value:'TRUE'},
    'settings/DEBUG_DATE':{key:'DEBUG_DATE',value:'2099-07-09T10:00:00+09:00'},
    'settings/DEBUG_TARGET_MONTH':{key:'DEBUG_TARGET_MONTH',value:'2099-07'},
    'members/M1':{member_id:'M1',member_name:'会員1',status:'有効',billing_group_id:'BG1',member_type:'一般',current_rank:'一級'},
    'members/M2':{member_id:'M2',member_name:'会員2',status:'有効',billing_group_id:'BG2',member_type:'一般',current_rank:'一級'},
    'teachers/T1':{teacher_id:'T1',status:'有効',can_accept_attendance:true},
    'dojos/L1':{location_id:'L1',status:'有効',display_name:'道場'},
    'billing_blocks/B1':{billing_block_id:'B1',location_id:'L1',status:'有効',slots_per_charge:2},
    'training_slots/S1':{slot_id:'S1',location_id:'L1',billing_block_id:'B1',status:'有効',duration_minutes:60},
    'training_slots/S2':{slot_id:'S2',location_id:'L1',billing_block_id:'B1',status:'有効',duration_minutes:90},
    'fees/P1':{plan_id:'P1',display_name:'料金',membership_fee_type:plan,unit_price:1000,maximum_amount:2000,status:'有効'},
    'plan_selection_rules/R1':{plan_selection_rule_id:'R1',member_type:'一般',selectable_plan_id:'P1'}
  };
}
const input=(slots=['S1'],extra={})=>({teacher_id:'T1',location_id:'L1',billing_block_id:'B1',
  attendance_date:'2099-07-09',attendance_session_id:'SESSION',
  attendance_items:[{member_id:'M1',slot_ids:slots,plan_id:'P1',current_rank:'初段'}],...extra});
function fixture(plan) {const db=memoryFirestore(seed(plan));
  const core=createAttendanceCore(db,{createRegistration:createAttendanceRegistrationTarget});return {db,core};}
const rows=(db,table)=>Object.entries(db.records()).filter(([key])=>key.startsWith(table+'/')).map(([,data])=>data);

test('existing build embeds the unchanged canonical GAS sources',()=>{
  const built=require('../.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');
  for(const [name,hash]of Object.entries(built.gasSourceHashes))
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',name))).digest('hex'),hash,name);
});
test('full batch writes attendance, selection, invoice, rank and the canonical View',async()=>{
  const {db,core}=fixture();const result=await core.register(input(['S1','S2']));
  assert.equal(result.ok,true);assert.equal(result.registered_count,2);
  assert.equal(rows(db,'monthly_selections').length,1);
  assert.equal(db.records()['monthly_selections/'+monthlySelectionDocumentId('BG1','2099-07')].plan_id,'P1');
  const invoice=rows(db,'invoices')[0];assert.equal(invoice['請求予定額'],1000);assert.equal(invoice['数量'],1);
  assert.equal(invoice['表示名'],'料金');
  assert.equal(db.records()['members/M1'].current_rank,'初段');
  const view=rows(db,'payment_status_views')[0];assert.equal(view['請求額'],1000);
  assert.equal(view['出席回数'],1);assert.equal(JSON.parse(view.attendance_items_json).length,2);
  assert.equal(result.rank_updates.updated_count,1);
});
test('repeat batch retains slots and does not duplicate attendance or billing',async()=>{
  const {db,core}=fixture('月額');await core.register(input());
  const result=await core.register(input());assert.equal(result.ok,true);
  assert.equal(result.registered_count,0);assert.equal(result.retained_count,1);
  assert.equal(rows(db,'attendances').length,1);assert.equal(rows(db,'invoices').length,1);
});
test('authorized paper import writes attendance only and derives historical target month',async()=>{
  const data=seed();
  data['monthly_selections/KEEP']={billing_group_id:'BG1',target_month:'2099-07',plan_id:'P1','状態':'有効'};
  data['invoices/KEEP']={invoice_id:'KEEP',billing_group_id:'BG1',target_month:'2099-07','請求予定額':777};
  data['payment_status_views/KEEP']={member_id:'M1',target_month:'2099-07','請求額':777};
  const db=memoryFirestore(data),core=createAttendanceCore(db,{createRegistration:createAttendanceRegistrationTarget});
  const before=db.records(),result=await core.register(input(['S1'],{attendance_date:'2098-06-15',source:'paper_attendance_review',skip_billing:true,paper_import_authorized:true}));
  assert.equal(result.ok,true);assert.equal(result.billing_skipped,true);
  const after=db.records(),attendance=rows(db,'attendances');
  assert.equal(attendance.length,1);assert.equal(attendance[0].target_month,'2098-06');
  for(const key of Object.keys(before).filter(key=>/^(monthly_selections|invoices|payments|paymentEvidences|payment_status_views)\//.test(key)))assert.deepEqual(after[key],before[key],key);
  assert.equal(Object.keys(after).filter(key=>key.startsWith('monthly_selections/')).length,Object.keys(before).filter(key=>key.startsWith('monthly_selections/')).length);
  assert.equal(Object.keys(after).filter(key=>key.startsWith('invoices/')).length,Object.keys(before).filter(key=>key.startsWith('invoices/')).length);
  assert.equal(Object.keys(after).filter(key=>key.startsWith('payment_status_views/')).length,Object.keys(before).filter(key=>key.startsWith('payment_status_views/')).length);
});
test('paper billing skip is rejected without trusted server authorization',async()=>{
  const {db,core}=fixture(),before=db.records();
  await assert.rejects(core.register(input(['S1'],{source:'paper_attendance_review',skip_billing:true})),/PAPER_ATTENDANCE_BILLING_SKIP_FORBIDDEN/);
  assert.deepEqual(db.records(),before);
  assert.throws(()=>validateAttendanceInput(input(['S1'],{source:'paper_attendance_review',skip_billing:true,paper_import_authorized:true})),/INVALID_ATTENDANCE_INPUT/);
});
test('clear, cancelled-state readback and re-registration follow the GAS core',async()=>{
  const {db,core}=fixture();await core.register(input());
  const result=await core.register(input([]));assert.equal(result.cancelled_count,1);
  assert.equal(rows(db,'attendances')[0]['状態'],'取消');
  assert.equal(JSON.parse(rows(db,'payment_status_views')[0].attendance_items_json).length,0);
  const saved=createAttendanceSavedState({memberDao:{readById:async(_s,id)=>db.records()['members/'+id]},
    attendanceDao:{queryEqual:async()=>rows(db,'attendances')}});
  assert.deepEqual((await saved({member_id:'M1',location_id:'L1',billing_block_id:'B1',attendance_date:'2099-07-09'})).selected_slot_ids,[]);
  await core.register(input());assert.equal(rows(db,'attendances').filter(r=>r['状態']==='有効').length,1);
});
test('usage invoice accumulates from facts and keeps the cap',async()=>{
  const {db,core}=fixture();await core.register(input());
  await core.register(input(['S1'],{attendance_date:'2099-07-10'}));
  await core.register(input(['S1'],{attendance_date:'2099-07-11'}));
  const invoice=rows(db,'invoices')[0];assert.equal(invoice['数量'],3);assert.equal(invoice['請求予定額'],2000);
  assert.equal(rows(db,'payment_status_views')[0]['請求額'],2000);
});
test('existing payments and declared monthly plan are preserved during usage synchronization',async()=>{
  const data=seed();data['monthly_selections/'+monthlySelectionDocumentId('BG1','2099-07')]=
    {billing_group_id:'BG1',target_month:'2099-07',member_id:'M1',plan_id:'P1','状態':'有効'};
  data['invoices/INV1']={invoice_id:'INV1',target_month:'2099-07',billing_group_id:'BG1',member_id:'M1',plan_id:'P1','表示名':'料金','請求予定額':1000,'支払状態':'未払い'};
  data['payments/PAY1']={payment_id:'PAY1',target_month:'2099-07',billing_group_id:'BG1',member_id:'M1',invoice_id:'INV1','入金額':500,'支払方法':'CASH','日時':'2099-07-09 09:00:00'};
  const db=memoryFirestore(data);const core=createAttendanceCore(db,{createRegistration:createAttendanceRegistrationTarget});
  const result=await core.register(input());assert.equal(result.ok,true);
  assert.equal(rows(db,'invoices').length,1);assert.equal(rows(db,'payments')[0]['入金額'],500);
  const view=rows(db,'payment_status_views')[0];assert.equal(view['入金額'],500);assert.equal(view['未払い額'],500);
});
test('transaction commit failure publishes no attendance or billing subset',async()=>{
  const db=memoryFirestore(seed());const before=db.records();
  const unavailable={...db,runTransaction:async fn=>db.runTransaction(async tx=>{
    await fn(tx);throw Error('COMMIT_UNAVAILABLE');
  })};
  const core=createAttendanceCore(unavailable,{createRegistration:createAttendanceRegistrationTarget});
  await assert.rejects(core.register(input()),/COMMIT_UNAVAILABLE/);assert.deepEqual(db.records(),before);
});
test('invalid slots, duplicate members, invalid dates or master deny leave no partial writes',async()=>{
  const {db,core}=fixture();const before=db.records();
  assert.equal((await core.register(input(['BAD']))).ok,false);assert.deepEqual(db.records(),before);
  await assert.rejects(core.register(input([], {attendance_date:'2099-02-30'})),/INVALID/);
  await assert.rejects(core.register(input([],{attendance_items:[{member_id:'M1',slot_ids:[]},{member_id:'M1',slot_ids:[]}]})),/INVALID/);
  await assert.rejects(core.register(input([],{teacher_id:'BAD'})),/先生/);
  assert.deepEqual(db.records(),before);
});
test('canonical existing selection of another plan cannot be overwritten',async()=>{
  const data=seed();data['monthly_selections/'+monthlySelectionDocumentId('BG1','2099-07')]=
    {billing_group_id:'BG1',target_month:'2099-07',plan_id:'OTHER','状態':'有効'};
  const db=memoryFirestore(data);const core=createAttendanceCore(db,{createRegistration:createAttendanceRegistrationTarget});
  const before=db.records();const result=await core.register(input());assert.equal(result.ok,false);assert.deepEqual(db.records(),before);
});
test('two concurrent batches retry and keep one attendance/invoice',async()=>{
  const {db,core}=fixture();const results=await Promise.all([core.register(input()),core.register(input())]);
  assert.ok(results.every(r=>r.ok));assert.equal(rows(db,'attendances').length,1);assert.equal(rows(db,'invoices').length,1);
  assert.ok(db.events.includes('retry'));
});
test('existing WebConnect dispatch authorizes every batch item before writing',async()=>{
  const {db,core}=fixture();let calls=0;
  const dispatch=createDispatch(createAdminApi({verifyIdToken:async token=>({uid:token,admin:token==='admin'}),
    getTimeTravel:async()=>({}),saveTimeTravel:async()=>({}),getSystemContext:async()=>({}),
    readMember:async()=>null,readMembers:async()=>[],
    readQrGeneratorOptions:async()=>({ok:true,members:[{member_id:'M1',member_name:'会員1',member_type:'一般'}],locations:[{location_id:'L1',location_name:'本部',internal:'SECRET'}],plans:[{plan_id:'SECRET'}],teachers:[{teacher_id:'SECRET'}]}),
    resolveDojoPrincipal:async user=>user.uid==='member'?{member_id:'M1'}:user.uid==='teacher'?{teacher_id:'T1'}:null,
    isActiveTeacher:async id=>id==='T1',
    registerAttendanceBatch:async data=>{calls++;return core.register(data);}}));
  const send=(token,data)=>dispatch({action:'attendance_batch',input:data,context:{authorization:token&&'Bearer '+token}});
  assert.equal((await send(null,input())).status,401);
  assert.equal((await send('stranger',input())).status,403);
  assert.equal((await send('member',input([],{attendance_items:[{member_id:'M1',slot_ids:[]},{member_id:'M2',slot_ids:[]}]}))).status,403);
  assert.equal(calls,0);
  assert.equal((await send('member',input())).status,200);
  assert.equal((await send('teacher',input([],{teacher_id:'BAD'}))).status,403);
  assert.equal((await send('admin',input())).status,200);
  const paper=input(['S1'],{attendance_date:'2098-06-15',source:'paper_attendance_review',skip_billing:true});
  assert.equal((await send('teacher',paper)).status,200);
  assert.equal((await send('member',paper)).status,403);
  const teacherOptions=await dispatch({action:'attendance_member_options',input:{action:'attendance_member_options'},method:'GET',context:{authorization:'Bearer teacher'}});
  assert.equal(teacherOptions.status,200);assert.deepEqual(teacherOptions.body,{ok:true,members:[{member_id:'M1',member_name:'会員1'}],locations:[{location_id:'L1',location_name:'本部'}]});
  assert.equal((await dispatch({action:'attendance_member_options',input:{action:'attendance_member_options'},method:'GET',context:{authorization:'Bearer member'}})).status,403);
  assert.equal((await dispatch({action:'qr_generator_options',input:{},method:'GET',context:{authorization:'Bearer teacher'}})).status,403);
  assert.equal(rows(db,'attendances').length,2);
});
test('member paper submission is pending, idempotent, billing-free and excluded from progress',async()=>{
  const {db,core}=fixture(),memberInput=input(['S1'],{teacher_id:'',source:'paper_attendance_member',skip_billing:true,member_submission_authorized:true});
  const first=await core.register(memberInput),second=await core.register(memberInput),attendance=rows(db,'attendances');
  assert.equal(first.registered_count,1);assert.equal(second.registered_count,0);assert.equal(second.retained_count,1);
  assert.equal(attendance.length,1);assert.equal(attendance[0]['状態'],'確認待ち');assert.equal(attendance[0].teacher_id,'');
  assert.equal(rows(db,'monthly_selections').length,0);assert.equal(rows(db,'invoices').length,0);assert.equal(rows(db,'payment_status_views').length,0);
  const saved=createAttendanceSavedState({memberDao:{readById:async()=>db.records()['members/M1']},attendanceDao:{queryEqual:async()=>attendance}});
  const state=await saved({member_id:'M1',location_id:'L1',billing_block_id:'B1',attendance_date:'2099-07-09'});
  assert.deepEqual(state.selected_slot_ids,['S1']);assert.deepEqual(state.pending_slot_ids,['S1']);
  const progress=projectAttendanceProgress({member:db.records()['members/M1'],attendanceRows:attendance,
    standard:{required_training_count:10,required_training_days:1,progress_display_enabled:true,next_rank:'初段'},rankOption:{rank_id:'R1',sort_order:1}});
  assert.equal(progress.recorded_training_count,0);assert.deepEqual(progress.attendance_by_date,[]);
});
test('member paper authorization forces own pending route and rejects escalation or another member',async()=>{
  const {db,core}=fixture();let calls=0,lastInput;
  const dispatch=createDispatch(createAdminApi({verifyIdToken:async token=>token==='none'?null:{uid:token},
    getTimeTravel:async()=>({}),saveTimeTravel:async()=>({}),getSystemContext:async()=>({}),readMember:async()=>null,readMembers:async()=>[],
    resolveDojoPrincipal:async user=>user.uid==='member'?{member_id:'M1'}:user.uid==='teacher'?{teacher_id:'T1'}:null,isActiveTeacher:async id=>id==='T1',
    registerAttendanceBatch:async data=>{calls++;lastInput=data;return core.register(data);}}));
  const send=(token,data)=>dispatch({action:'attendance_batch',input:data,context:{authorization:token&&'Bearer '+token}});
  const pending=input(['S1'],{teacher_id:'',source:'paper_attendance_member',skip_billing:true,initial_status:'有効',autoApprove:true});
  assert.equal((await send(null,pending)).status,401);
  assert.equal((await send('member',{...pending,attendance_items:[{...pending.attendance_items[0],member_id:'M2'}]})).status,403);
  assert.equal((await send('member',{...pending,teacher_id:'T1'})).status,400);
  assert.equal((await send('member',{...pending,source:'paper_attendance_review',teacher_id:'T1'})).status,403);
  assert.equal(calls,0);
  assert.equal((await send('member',pending)).status,200);assert.equal(calls,1);
  assert.equal(lastInput.member_submission_authorized,true);assert.equal(lastInput.paper_import_authorized,undefined);assert.equal(lastInput.teacher_id,'');
  assert.equal(rows(db,'attendances')[0]['状態'],'確認待ち');
});
module.exports={memoryFirestore,seed,input};
