'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDispatch } = require('../cloud/api/webConnect.cjs');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
const dispatch = createDispatch(createAdminApi({
  verifyIdToken: async token => ({ uid: token, admin: token === 'admin' }),
  getTimeTravel: async () => ({ enabled: true }),
  saveTimeTravel: async input => ({ ok: true, input }),
  getSystemContext: async () => ({ ok: true, system_now: '2026-10-13 10:00:00', target_month: '2026-10', time_travel_enabled: false }),
  readMember: async () => null, readMembers: async () => []
}));
test('shared read action uses existing handler', async () => {
  const r = await dispatch({ action: 'system_context' });
  assert.equal(r.status, 200);
  assert.equal(r.body.target_month, '2026-10');
});
test('admin read requires existing auth', async () => {
  assert.equal((await dispatch({ action: 'time_travel_admin' })).status, 401);
  assert.equal((await dispatch({ action: 'time_travel_admin', context: { authorization: 'Bearer user' } })).status, 403);
  assert.equal((await dispatch({ action: 'time_travel_admin', context: { authorization: 'Bearer admin' } })).status, 200);
});
test('admin write delegates input', async () => {
  const r = await dispatch({ action: 'time_travel_set', input: { enabled: false }, context: { authorization: 'Bearer admin' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.input, { enabled: false, now: '', target_month: '' });
});
test('unconnected actions fail closed', async () => {
  assert.equal((await dispatch({ action: 'attendance_saved_state' })).status, 400);
  assert.equal((await dispatch({ action: 'unknown' })).status, 404);
});
