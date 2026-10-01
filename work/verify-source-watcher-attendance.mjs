import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {watchDto,assertWatchedDto} from '../tools/source-watcher.mjs';

const require=createRequire(import.meta.url);
const {makeAttendancePlan}=require('../shared/AttendanceNative.js');
const entitySource=fs.readFileSync(new URL('../schema/Attendance.yml',import.meta.url),'utf8');
const systemKeySource=fs.readFileSync(new URL('../schema/SystemKey.yml',import.meta.url),'utf8');
const facts={
  members:[{member_id:'M1','状態':'有効'}],teachers:[{teacher_id:'T1','状態':'有効','出席受付可':true}],
  locations:[{location_id:'L1','状態':'有効'}],billingBlocks:[{billing_block_id:'B1',location_id:'L1','状態':'有効'}],
  trainingSlots:[{slot_id:'S1',location_id:'L1',billing_block_id:'B1','状態':'有効','稽古時間分':60}],attendances:[]
};
const options={teacher_id:'T1',location_id:'L1',billing_block_id:'B1',attendance_session_id:'SESSION',attendance_date:'2099-07-09',target_month:'2099-07',attendance_items:[{member_id:'M1',slot_ids:['S1']}],require_teacher:true};
const deps={uuid:()=> '1',dateKey:value=>String(value).slice(0,10)};

test('Attendance make DTO passes Source Watcher',()=>{
  const dto=makeAttendancePlan(options,facts,deps).rowsToAppend[0];
  assert.deepEqual(watchDto(dto,{entitySource,systemKeySource}),{ok:true,errors:[]});
});

test('Source Watcher rejects naming-rule violations before collection',()=>{
  assert.throws(()=>assertWatchedDto({'登録日時':'x'},{entitySource,systemKeySource}),/NAMING_RULE_VIOLATION:登録日時/);
});

test('Source Watcher stops on rule-valid but unregistered keys',()=>{
  assert.throws(()=>assertWatchedDto({unknown_key:'x'},{entitySource,systemKeySource}),/UNREGISTERED_KEY:unknown_key/);
});
