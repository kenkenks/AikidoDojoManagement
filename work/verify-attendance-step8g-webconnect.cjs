'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
const { createDispatch } = require('../cloud/api/webConnect.cjs');
const make = (account, admin = false) => createDispatch(createAdminApi({
  verifyIdToken: async () => ({ uid: 'uid1', admin }),
  getTimeTravel: async () => ({}), saveTimeTravel: async () => ({}),
  getSystemContext: async () => ({ok:true,system_now:'2026-10-14',target_month:'2026-10',time_travel_enabled:false}),
  readMember: async () => null, readMembers: async () => [],
  readAttendanceSavedState: async p => ({ok:true,member_id:p.member_id}),
  readAttendanceSessionInfo: async () => ({ok:true}),
  resolveDojoPrincipal: async () => account
}));
const call = (dispatch, action, member_id = 'M001') => dispatch({ action,
  input:{member_id,location_id:'L1',billing_block_id:'B1',attendance_date:'2026-10-14'},
  context:{authorization:'Bearer token'} });
test('linked member reads own saved attendance through existing dispatcher',async()=>{
  assert.equal((await call(make({uid:'uid1',member_id:'M001'}),'attendance_saved_state')).status,200);
});
test('unlinked and different member fail closed',async()=>{
  assert.equal((await call(make(null),'attendance_saved_state')).status,403);
  assert.equal((await call(make({uid:'uid1',member_id:'M001'}),'attendance_saved_state','M002')).status,403);
});
test('linked member can read session schedule but not member record',async()=>{
  const d=make({uid:'uid1',member_id:'M001'});
  assert.equal((await call(d,'attendance_session_info')).status,200);
  assert.equal((await call(d,'member_read')).status,403);
});
test('admin retains original access; unconnected write stays closed',async()=>{
  const d=make(null,true);
  assert.equal((await call(d,'attendance_saved_state')).status,200);
  assert.notEqual((await call(d,'attendance_batch')).status,200);
});
