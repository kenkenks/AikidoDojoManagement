'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const tool=require('./snapshot-paper-attendance-dev.cjs');

const target={memberId:tool.TEST_MEMBER_ID,date:'2026-10-12'};
const row=(id,slot,state='有効',extra={})=>({__id:id,attendance_id:id,member_id:tool.TEST_MEMBER_ID,
  '稽古日':target.date,'稽古時間分':60,'状態':state,slot_id:slot,location_id:'PAPER_UNKNOWN_LOCATION',
  billing_block_id:'PAPER_UNKNOWN_BILLING_BLOCK',...extra});
const snapshot=(overrides={})=>tool.buildSnapshot({member:{member_id:tool.TEST_MEMBER_ID,status:'有効'},attendanceRows:[],
  progress:{ok:true,attendance_by_date:[]},billing:{},generatedAt:'2026-10-23T00:00:00.000Z',...overrides},target);

test('accepts only the fixed DEV project, mode and dedicated test member',()=>{
  assert.doesNotThrow(()=>tool.validateProfile({target:'dev-firebase',runtime:'firebase',mode:'development',
    projectId:tool.PROJECT_ID,confirmedDevelopmentProject:tool.PROJECT_ID}));
  assert.throws(()=>tool.validateProfile({target:'prod',runtime:'firebase',mode:'production',projectId:'prod'}),/DEV_PROFILE_REQUIRED/);
  assert.throws(()=>tool.validateMember('REAL_MEMBER'),/DEV_TEST_MEMBER_REQUIRED/);
  assert.throws(()=>tool.assertNoEmulator({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}),/FIRESTORE_EMULATOR_FORBIDDEN/);
});
test('missing test member is a complete, explicit and non-PII snapshot state',()=>{
  const value=tool.buildSnapshot({member:null,attendanceRows:[],billing:{},generatedAt:'x'},target);
  assert.equal(value.complete,true);assert.equal(value.member.exists,false);
  assert.equal(value.progress_summary.reason,'TEST_MEMBER_NOT_CREATED');
  assert.equal(JSON.stringify(value).includes('member_name'),false);
});
test('separates active paper, cancelled paper and normal QR rows and sums minutes',()=>{
  const value=snapshot({attendanceRows:[row('p1','PAPER_UNKNOWN_SLOT_1'),row('p2','PAPER_UNKNOWN_SLOT_2','取消'),
    row('q1','KYO_MON_1030','有効',{location_id:'HONBU',billing_block_id:'KYO_MON'})],
    progress:{ok:true,attendance_by_date:[{attendance_date:target.date,training_minutes:120,training_hours:2}]}});
  assert.equal(value.attendance.paper_active_slot_count,1);assert.equal(value.attendance.paper_active_minutes,60);
  assert.equal(value.attendance.target_date_confirmed_minutes,120);assert.equal(value.attendance.cancelled.length,1);
  assert.deepEqual(value.attendance.normal_qr.map(x=>x.id),['q1']);
});
test('billing comparison uses record contents, not only counts',()=>{
  const before=snapshot({billing:{invoices:[{__id:'INV1',member_id:tool.TEST_MEMBER_ID,target_month:'2026-10',金額:100}]}});
  const after=snapshot({billing:{invoices:[{__id:'INV1',member_id:tool.TEST_MEMBER_ID,target_month:'2026-10',金額:200}]}});
  const result=tool.compareSnapshots(before,after);assert.equal(result.ok,false);
  assert.deepEqual(result.anomalies,['BILLING_CHANGED:invoices']);
});
test('paper additions are expected but normal QR changes are anomalous',()=>{
  const before=snapshot();const paperAfter=snapshot({attendanceRows:[row('p1','PAPER_UNKNOWN_SLOT_1')]});
  assert.equal(tool.compareSnapshots(before,paperAfter).ok,true);
  const qrAfter=snapshot({attendanceRows:[row('q1','KYO_MON_1030','有効',{location_id:'HONBU',billing_block_id:'KYO'})]});
  assert.equal(tool.compareSnapshots(before,qrAfter).ok,false);
  assert.match(tool.compareSnapshots(before,qrAfter).anomalies.join(','),/NORMAL_QR_ATTENDANCE_CHANGED/);
});
test('output path cannot escape the ignored snapshot directory',()=>{
  assert.match(tool.outputPath('before.json'),/paper-attendance-dev-snapshots/);
  assert.throws(()=>tool.outputPath('../outside.json'),/INVALID_OUTPUT_FILENAME/);
});
test('tool source contains no Firestore write operations',()=>{
  const source=fs.readFileSync(require.resolve('./snapshot-paper-attendance-dev.cjs'),'utf8');
  for(const token of ['.set(','.create(','.update(','.delete(','.batch(','.runTransaction('])assert.equal(source.includes(token),false,token);
});
