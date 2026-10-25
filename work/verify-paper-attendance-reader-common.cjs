'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const legacy = require('../web/qr/paper_attendance_review.js');
const shared = require('../web/qr/paper_attendance_reader.js');

const root = path.resolve(__dirname, '..');
const reviewSource = fs.readFileSync(path.join(root, 'web/qr/paper_attendance_review.js'), 'utf8');
const reviewHtml = fs.readFileSync(path.join(root, 'web/qr/paper_attendance_review.html'), 'utf8');
const adapterSource = fs.readFileSync(path.join(root, 'web/qr/paper_attendance_teacher_adapter.js'), 'utf8');
const adapterContext = {window:{}};
vm.runInNewContext(adapterSource, adapterContext);

assert.equal(adapterContext.window.DOJO_PAPER_ATTENDANCE_ADAPTER.audience, 'teacher');
assert.equal(adapterContext.window.DOJO_PAPER_ATTENDANCE_ADAPTER.autoApprove, true);
assert.ok(reviewSource.includes('DOJO_PAPER_ATTENDANCE_READER'), 'teacher screen uses shared reader');
for (const duplicate of ['function mapOcr(', 'function buildAttendanceDifferencePlan(', 'function registerDifferencePlan(', 'function clearCellsFromPaperOrder(']) {
  assert.equal(reviewSource.includes(duplicate), false, `${duplicate} is not duplicated in teacher screen`);
}
const adapterIndex = reviewHtml.indexOf('paper_attendance_teacher_adapter.js');
const readerIndex = reviewHtml.indexOf('paper_attendance_reader.js');
const reviewIndex = reviewHtml.indexOf('paper_attendance_review.js');
assert.ok(adapterIndex >= 0 && adapterIndex < readerIndex && readerIndex < reviewIndex, 'adapter and reader load before teacher UI');
assert.equal(reviewSource.includes('autoApprove:'), false, 'UI option is not sent as registration authority');

const comparableFunctions = [
  'validateGridCorners','normalizeImageScale','normalizePaperDetection','blankCells',
  'normalizeDate','fullDate','buildAttendanceDifferencePlan',
  'buildDifferenceRegistrationRecords','buildRegistrationRecords','paperOwnerKey',
  'normalizeAttendanceByDate','cellIndexForPoint','cellIndexForCandidate','mapOcr',
  'aggregate','nextPendingIndex','paperCellSequence','clearCellsFromPaperOrder',
  'confirmTrailingEmptyCells','inkScorePixels'
];

assert.deepEqual(Object.keys(shared).sort(), Object.keys(legacy).sort());
for (const name of comparableFunctions) assert.equal(typeof shared[name], 'function', `${name} is shared`);
assert.equal(shared.ROWS, 20);
assert.equal(shared.COLS, 20);
assert.deepEqual(shared.IDEAL_CORNERS, [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
assert.deepEqual(shared.DEFAULT_CORNERS, legacy.DEFAULT_CORNERS);

for (const value of [null, 49, 50, 73, 95, 101]) {
  assert.equal(shared.normalizeImageScale(value), legacy.normalizeImageScale(value));
}
for (const value of ['', '1005', '10/5', '2026-10-05', '13/40']) {
  assert.equal(shared.normalizeDate(value), legacy.normalizeDate(value));
}

const payload = {candidates:[
  {printed_row:20,column:1,date:'10/5',text:'10/5',confidence:.9},
  {printed_row:19,column:1,date:'',text:'??/??',status:'review',confidence:.2}
]};
assert.deepEqual(shared.mapOcr(payload), legacy.mapOcr(payload));

const cells = shared.blankCells().map(cell => ({...cell, confirmed:true}));
cells[0] = {...cells[0], date:'10/5', raw:'10/5', status:'recognized'};
cells[1] = {...cells[1], date:'10/5', raw:'10/5', status:'recognized'};
cells[2] = {...cells[2], date:'10/5', raw:'10/5', status:'recognized'};
const confirmedByDate = [{attendance_date:'2026-10-05',training_minutes:120}];
assert.deepEqual(
  shared.buildAttendanceDifferencePlan({confirmedByDate,desiredCells:cells,year:2026}),
  legacy.buildAttendanceDifferencePlan({confirmedByDate,desiredCells:cells,year:2026})
);
assert.deepEqual(
  shared.buildDifferenceRegistrationRecords(cells,{memberId:'M001',year:2026,confirmedByDate}),
  legacy.buildDifferenceRegistrationRecords(cells,{memberId:'M001',year:2026,confirmedByDate})
);

const small = Array.from({length:16},(_,index)=>({
  row:Math.floor(index/4)+1,column:index%4+1,raw:'',date:'',confidence:0,
  inkScore:0,status:'empty',confirmed:true,manual:false
}));
assert.deepEqual(
  [...shared.clearCellsFromPaperOrder(small,5).keys()],
  [...legacy.clearCellsFromPaperOrder(small,5).keys()]
);

async function compareRegistration(){
  const scope={teacher_id:'T001',location_id:'PAPER_UNKNOWN_LOCATION',billing_block_id:'PAPER_UNKNOWN_BILLING_BLOCK',slots:Array.from({length:8},(_,index)=>({slot_id:`PAPER_UNKNOWN_SLOT_${index+1}`}))};
  const calls=[];
  const result=await shared.registerDifferencePlan({
    desiredCells:cells,memberId:'M001',year:2026,scope,
    readProgress:async()=>({attendance_by_date:confirmedByDate}),
    readState:async()=>({current_rank:'成人無級',selected_slot_ids:['PAPER_UNKNOWN_SLOT_1','PAPER_UNKNOWN_SLOT_2']}),
    register:async input=>{calls.push(input);},requestId:()=> 'COMMON-1'
  });
  assert.equal(result.success,1);
  assert.equal(calls.length,1);
  assert.equal(calls[0].attendance_items[0].slot_ids.at(-1),'PAPER_UNKNOWN_SLOT_3');
  assert.equal(calls[0].source,'paper_attendance_review');
  assert.equal(calls[0].skip_billing,true);
}

compareRegistration().then(()=>console.log(`PASS shared paper attendance reader contract (${comparableFunctions.length} parity checks)`));
