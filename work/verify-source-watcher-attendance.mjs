import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {watchDto,assertWatchedDto} from '../tools/source-watcher.mjs';

const entitySource=fs.readFileSync(new URL('../schema/Attendance.yml',import.meta.url),'utf8');
const systemKeySource=fs.readFileSync(new URL('../schema/SystemKey.yml',import.meta.url),'utf8');
const attendanceDto={
  attendance_date:'2099-07-09',member_id:'M1',target_month:'2099-07',
  location_id:'L1',slot_id:'S1',billing_block_id:'B1',teacher_id:'T1',
  attendance_session_id:'SESSION',training_minutes:60,status:'有効',
  source:'attendance_core',remarks:''
};

test('Attendance DTO fixture passes Source Watcher',()=>{
  assert.deepEqual(watchDto(attendanceDto,{entitySource,systemKeySource}),{ok:true,errors:[]});
});

test('Source Watcher rejects naming-rule violations before collection',()=>{
  assert.throws(()=>assertWatchedDto({'登録日時':'x'},{entitySource,systemKeySource}),/NAMING_RULE_VIOLATION:登録日時/);
});

test('Source Watcher stops on rule-valid but unregistered keys',()=>{
  assert.throws(()=>assertWatchedDto({unknown_key:'x'},{entitySource,systemKeySource}),/UNREGISTERED_KEY:unknown_key/);
});
