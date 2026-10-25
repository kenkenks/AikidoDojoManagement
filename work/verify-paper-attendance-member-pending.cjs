'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const reader=require('../web/qr/paper_attendance_reader.js');

function cells(count){const value=reader.blankCells().map(cell=>({...cell,confirmed:true}));for(let i=0;i<count;i++)value[i]={...value[i],date:'10/12',status:'recognized'};return value;}
const scope={location_id:'PAPER_UNKNOWN_LOCATION',billing_block_id:'PAPER_UNKNOWN_BILLING_BLOCK',slots:Array.from({length:8},(_,i)=>({slot_id:'PAPER_UNKNOWN_SLOT_'+(i+1)}))};

test('member pending plan sends only the shortage and never requests approval',async()=>{
  let sent;
  const result=await reader.registerPendingDifferencePlan({desiredCells:cells(3),memberId:'M1',year:2026,scope,
    readProgress:async()=>({attendance_by_date:[{attendance_date:'2026-10-12',training_minutes:120}]}),
    readState:async()=>({selected_slot_ids:[],pending_slot_ids:[],current_rank:'成人無級'}),register:async input=>{sent=input;return{ok:true};}});
  assert.equal(result.success,1);assert.equal(sent.source,'paper_attendance_member');assert.equal(sent.skip_billing,true);
  assert.equal(sent.teacher_id,'');assert.equal(sent.autoApprove,undefined);assert.deepEqual(sent.attendance_items[0].slot_ids,['PAPER_UNKNOWN_SLOT_1']);
});

test('pending attendance participates in resend duplicate prevention',async()=>{
  let calls=0;
  const result=await reader.registerPendingDifferencePlan({desiredCells:cells(3),memberId:'M1',year:2026,scope,
    readProgress:async()=>({attendance_by_date:[{attendance_date:'2026-10-12',training_minutes:120}]}),
    readState:async()=>({selected_slot_ids:['PAPER_UNKNOWN_SLOT_1'],pending_slot_ids:['PAPER_UNKNOWN_SLOT_1']}),register:async()=>{calls++;}});
  assert.equal(calls,0);assert.equal(result.duplicate,1);assert.equal(result.items[0].status,'already_pending');
});

test('confirmed paper slots are retained but do not mask a new shortage',async()=>{
  let sent;
  await reader.registerPendingDifferencePlan({desiredCells:cells(3),memberId:'M1',year:2026,scope,
    readProgress:async()=>({attendance_by_date:[{attendance_date:'2026-10-12',training_minutes:120}]}),
    readState:async()=>({selected_slot_ids:['PAPER_UNKNOWN_SLOT_1','PAPER_UNKNOWN_SLOT_2'],pending_slot_ids:[]}),register:async input=>{sent=input;}});
  assert.deepEqual(sent.attendance_items[0].slot_ids,['PAPER_UNKNOWN_SLOT_1','PAPER_UNKNOWN_SLOT_2','PAPER_UNKNOWN_SLOT_3']);
});
