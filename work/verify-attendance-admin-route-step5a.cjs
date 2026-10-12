'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
const calls = [];
const make = (user = { uid:'admin1', admin:true }) => createAdminApi({
  verifyIdToken: async () => user,
  getTimeTravel: async () => ({}), saveTimeTravel: async () => ({}),
  getSystemContext: async () => ({ok:true,system_now:"2026-10-12T00:00:00+09:00",target_month:"2026-10",time_travel_enabled:false}),
  readMember: async () => null, readMembers: async () => [],
  readAttendanceSavedState: async params => { calls.push(params); return {ok:true, selected_slot_ids:['S1']}; }
});
const route = '/api/admin/attendance/saved-state?member_id=M1&location_id=L1&billing_block_id=B1&attendance_date=2026-10-11';
const request = (url=route, method='GET', authorization='Bearer test') => ({url,method,authorization});
test('admin GET forwards exact parameters and result', async () => {
  calls.length=0;
  const result=await make()(request());
  assert.equal(result.status,200);
  assert.deepEqual(result.body.selected_slot_ids,['S1']);
  assert.deepEqual(calls,[{member_id:'M1',location_id:'L1',billing_block_id:'B1',attendance_date:'2026-10-11'}]);
});
test('requires authentication and admin claim before data access', async () => {
  calls.length=0;
  assert.equal((await make()(request(route,'GET',null))).status,401);
  assert.equal((await make({uid:'u',admin:false})(request())).status,403);
  assert.deepEqual(calls,[]);
});
test('rejects wrong methods, missing or duplicate parameters', async () => {
  const api=make();
  assert.equal((await api(request(route,'POST'))).status,405);
  assert.equal((await api(request('/api/admin/attendance/saved-state?member_id=M1'))).status,400);
  assert.equal((await api(request(route+'&member_id=M2'))).status,400);
});
test('existing member route remains functional', async () => {
  const result=await make()(request('/api/admin/members/M1'));
  assert.equal(result.status,404);
  assert.equal(result.body.error,'MEMBER_NOT_FOUND');
});
test('backend failures do not leak internals', async () => {
  const api=createAdminApi({verifyIdToken:async()=>({uid:'u',admin:true}),getTimeTravel:async()=>null,saveTimeTravel:async()=>null,getSystemContext:async()=>({ok:true}),readMember:async()=>null,readMembers:async()=>[],readAttendanceSavedState:async()=>{throw Error('secret');}});
  assert.deepEqual((await api(request())).body,{error:'ATTENDANCE_READ_UNAVAILABLE'});
});
