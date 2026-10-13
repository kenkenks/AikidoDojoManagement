'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createSessionInfo} = require('../cloud/attendance/session-info.cjs');
const masters = {location:{location_id:'L001','表示名':'本部'},billingBlocks:[
  {location_id:'L001',billing_block_id:'B1','曜日':'火曜日','表示名':'一般','1課金あたり枠数':2},
  {location_id:'L001',billing_block_id:'B2','曜日':'火曜日','表示名':'夜間'}],trainingSlots:[
  {location_id:'L001',billing_block_id:'B1',slot_id:'S1','開始時刻':'10:00','終了時刻':'11:00'},
  {location_id:'L001',billing_block_id:'B2',slot_id:'S2','開始時刻':'18:00','終了時刻':'19:00'}]};
const make = (data=masters) => createSessionInfo({readSessionMasters:async()=>data});
test('current block inferred on JST Tuesday, preserving GAS response', async()=>{
  const result = await make()({location_id:'L001',at:'2026-10-13T10:30:00+09:00'});
  assert.equal(result.ok,true);assert.equal(result.billing_block_id,'B1');assert.equal(result.inferred,true);
  assert.equal(result.slots_per_charge,2);assert.equal(result.slots[0].duration_minutes,60);
  assert.equal(result.billing_block_candidates.length,2);
});
test('nearby window begins 30 minutes before slot', async()=>{
  const result = await make()({location_id:'L001',at:'2026-10-13T09:45:00+09:00'});
  assert.equal(result.billing_block_id,'B1');assert.equal(result.inferred,true);
});
test('outside schedule requires manual selection, explicit block allowed', async()=>{
  const get = make();const p={location_id:'L001',at:'2026-10-13T15:00:00+09:00'};
  const choice=await get(p);assert.equal(choice.requires_selection,true);assert.equal(choice.billing_block_candidates.length,2);
  const explicit=await get({...p,billing_block_id:'B2'});assert.equal(explicit.inferred,false);assert.equal(explicit.slots[0].slot_id,'S2');
});
test('invalid dojo, inactive block, absent slots fail closed', async()=>{
  assert.equal((await make({...masters,location:null})({location_id:'L001'})).ok,false);
  assert.equal((await make({...masters,billingBlocks:masters.billingBlocks.map(b=>({...b,'状態':'無効'}))})({location_id:'L001',billing_block_id:'B1'})).ok,false);
  assert.equal((await make({...masters,trainingSlots:[]})({location_id:'L001',billing_block_id:'B1'})).ok,false);
});
test('invalid timestamp rejected', async()=>{
  await assert.rejects(make()({location_id:'L001',at:'nonsense'}),/課金枠判定日時が不正/);
});
