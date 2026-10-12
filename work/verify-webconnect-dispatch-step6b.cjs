'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDispatch } = require('../cloud/api/webConnect.cjs');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
const seen = [];
const handler = createAdminApi({
  verifyIdToken: async token => ({ uid: token, admin: token === 'admin' }),
  getTimeTravel: async () => ({ enabled: true }),
  saveTimeTravel: async input => ({ ok: true, input }),
  getSystemContext: async () => ({ ok: true, system_now: '2026-10-13', target_month: '2026-10', time_travel_enabled: false }),
  readMember: async () => null, readMembers: async () => [],
  readAttendanceSavedState: async input => { seen.push(input); return { ok: true }; }
});
const dispatch = createDispatch(request => {
  assert.equal(request.url, undefined, 'dispatch must not construct URLs');
  assert.equal(request.method, undefined, 'dispatch must not construct HTTP methods');
  return handler(request);
});
const admin = { authorization: 'Bearer admin' };
test('time travel direct operation preserves authentication', async () => {
  assert.equal((await dispatch({ action: 'time_travel_admin' })).status, 401);
  assert.equal((await dispatch({ action: 'time_travel_admin', context: { authorization: 'Bearer user' } })).status, 403);
  assert.equal((await dispatch({ action: 'time_travel_admin', context: admin })).status, 200);
  const result = await dispatch({ action: 'time_travel_set', input: { enabled: false }, context: admin });
  assert.equal(result.status, 200);
  assert.equal(result.body.input.enabled, false);
});
test('attendance direct operation preserves authentication and input', async () => {
  const input = { member_id: 'M &1', location_id: 'L01', billing_block_id: 'BG01', attendance_date: '2026-10-13' };
  assert.equal((await dispatch({ action: 'attendance_saved_state', input })).status, 401);
  assert.equal((await dispatch({ action: 'attendance_saved_state', input, context: { authorization: 'Bearer user' } })).status, 403);
  assert.equal((await dispatch({ action: 'attendance_saved_state', input, context: admin })).status, 200);
  assert.deepEqual(seen.at(-1), input);
});
test('system context direct operation stays public', async () => {
  assert.equal((await dispatch({ action: 'system_context' })).status, 200);
});
