'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAttendanceGetApi}=require('../cloud/attendance/get-api.cjs');
const url='/api/attendance/saved-state?member_id=M1&attendance_date=2026-10-11&location_id=L1&billing_block_id=B1';
const memberDao={readById:async()=>({status:'有効',current_rank:'1級'})};
const attendanceDao={queryEqual:async()=>[{slot_id:'S1'}]};
const api=authorizeQr=>createAttendanceGetApi({memberDao,attendanceDao,authorizeQr});
test('requires an explicit QR verifier and rejects unknown identity',async()=>{
  assert.throws(()=>createAttendanceGetApi({memberDao,attendanceDao}),/authorizeQr/);
  assert.equal((await api(async()=>false)({method:'GET',url})).status,403);
  assert.equal((await api(async()=>{throw Error('secret');})({method:'GET',url})).status,403);
});
test('checks QR member binding before reading Firestore',async()=>{
  let member;
  const handle=api(async({memberId})=>{member=memberId;return memberId==='M1';});
  const result=await handle({method:'GET',url});
  assert.equal(member,'M1');
  assert.equal(result.status,200);
  assert.deepEqual(result.body.selected_slot_ids,['S1']);
});
test('rejects wrong methods, paths, invalid inputs and storage errors',async()=>{
  const handle=api(async()=>true);
  assert.equal((await handle({method:'POST',url})).status,405);
  assert.equal((await handle({method:'GET',url:'/api/attendance/nope'})).status,404);
  assert.equal((await handle({method:'GET',url:'/api/attendance/saved-state'})).status,400);
  const broken=createAttendanceGetApi({memberDao,attendanceDao:{queryEqual:async()=>{throw Error('private');}},authorizeQr:async()=>true});
  assert.deepEqual((await broken({method:'GET',url})).body,{error:'ATTENDANCE_READ_UNAVAILABLE'});
});
