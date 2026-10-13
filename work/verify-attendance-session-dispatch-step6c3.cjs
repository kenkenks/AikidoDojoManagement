'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createAdminApi} = require('../cloud/api/admin-api.cjs');
const {createDispatch} = require('../cloud/api/webConnect.cjs');
let called = 0;
const handler = createAdminApi({
  verifyIdToken: async token => ({uid: token, admin: token === 'admin'}),
  getTimeTravel: async () => ({}), saveTimeTravel: async () => ({}),
  getSystemContext: async () => ({ok:true,system_now:'2026-10-13',target_month:'2026-10',time_travel_enabled:false}),
  readMember: async () => null, readMembers: async () => [],
  readAttendanceSessionInfo: async input => {called++; return {ok:true,location_id:input.location_id};}
});
const dispatch = createDispatch(request => {
  assert.equal(request.url, undefined);
  assert.equal(request.method, undefined);
  return handler(request);
});
const action = 'attendance_session_info';
const input = {location_id:'L01'};
test('SessionInfo denies anonymous and non-admin users', async () => {
  assert.equal((await dispatch({action,input})).status,401);
  assert.equal((await dispatch({action,input,context:{authorization:'Bearer member'}})).status,403);
  assert.equal(called,0);
});
test('SessionInfo uses existing authenticated handler and operation', async () => {
  const result = await dispatch({action,input,context:{authorization:'Bearer admin'}});
  assert.equal(result.status,200);
  assert.equal(result.body.location_id,'L01');
  assert.equal(called,1);
});
test('SessionInfo rejects invalid input after auth', async () => {
  const result = await dispatch({action,input:{},context:{authorization:'Bearer admin'}});
  assert.equal(result.status,400);
  assert.equal(called,1);
});
