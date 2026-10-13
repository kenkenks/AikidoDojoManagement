'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSessionMasterReader}=require('../cloud/attendance/session-masters.cjs');
const {createSessionInfo}=require('../cloud/attendance/session-info.cjs');
const schemas=require('../shared/Attendance_Master_Schemas.generated.json');
const {tableSchema}=require('./gas2firebase-copy.cjs');
const physical={
  Dojo:{location_id:'HONBU',display_name:'京都本部',status:'有効'},
  BillingBlock:{billing_block_id:'B1',location_id:'HONBU',display_name:'夜稽古',day_of_week:'火曜日',slots_per_charge:2,status:'有効'},
  TrainingSlot:{slot_id:'S1',location_id:'HONBU',billing_block_id:'B1',display_name:'第一部',start_time:'19:00',end_time:'20:00',duration_minutes:60,status:'有効'}
};
function reader(overrides={}) {
  return createSessionMasterReader({masterDao:{
    readById:async()=>overrides.Dojo??physical.Dojo,
    queryEqual:async source=>source.collection==='billing_blocks'?[overrides.BillingBlock??physical.BillingBlock]:[overrides.TrainingSlot??physical.TrainingSlot]
  }});
}
test('generated master schema is exactly the current PDD/glossary mapping',async()=>{
  for(const name of Object.keys(schemas)) assert.deepEqual(schemas[name],await tableSchema(name));
});
test('physical Firestore masters become logical GAS DTOs and produce SessionInfo',async()=>{
  const read=reader();const rows=await read('HONBU');
  assert.equal(rows.location['表示名'],'京都本部');
  assert.equal(rows.billingBlocks[0]['曜日'],'火曜日');
  assert.equal(rows.trainingSlots[0]['開始時刻'],'19:00');
  const result=await createSessionInfo({readSessionMasters:read})({location_id:'HONBU',at:'2026-10-13T19:30:00+09:00'});
  assert.equal(result.ok,true);assert.equal(result.billing_block_id,'B1');
  assert.equal(result.location_name,'京都本部');assert.equal(result.slots[0].start_time,'19:00');
});
test('unmapped or missing embedded primary keys fail closed',async()=>{
  await assert.rejects(reader({BillingBlock:{...physical.BillingBlock,unknown:'x'}})('HONBU'),/UNMAPPED_PHYSICAL_FIELD/);
  const {billing_block_id,...noId}=physical.BillingBlock;
  await assert.rejects(reader({BillingBlock:noId})('HONBU'),/SESSION_MASTER_PRIMARY_KEY_REQUIRED/);
});
test('wrong embedded primary key type fails closed',async()=>{
  await assert.rejects(reader({TrainingSlot:{...physical.TrainingSlot,slot_id:42}})('HONBU'),/SESSION_MASTER_PRIMARY_KEY_REQUIRED/);
});
