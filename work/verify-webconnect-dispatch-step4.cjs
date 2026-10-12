'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDispatch } = require('../cloud/api/webConnect.cjs');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
const calls = [];
const dispatch = createDispatch(createAdminApi({
  verifyIdToken: async token => ({ uid: token, admin: token === 'admin' }),
  getTimeTravel: async () => ({ enabled: false }),
  saveTimeTravel: async () => ({ ok: true }),
  getSystemContext: async () => ({ ok: true, system_now: '2026-10-13', target_month: '2026-10', time_travel_enabled: false }),
  readMember: async () => null, readMembers: async () => [],
  readAttendanceSavedState: async params => { calls.push(params); return { ok: true, selected_slot_ids: [] }; }
}));
const input = { member_id: 'M &1', location_id: 'L01', billing_block_id: 'BG01', attendance_date: '2026-10-13' };
test('attendance saved state routes through existing authenticated handler', async () => {
  assert.equal((await dispatch({ action: 'attendance_saved_state', input })).status, 401);
  assert.equal((await dispatch({ action: 'attendance_saved_state', input, context: { authorization: 'Bearer user' } })).status, 403);
  const result = await dispatch({ action: 'attendance_saved_state', input, context: { authorization: 'Bearer admin' } });
  assert.equal(result.status, 200);
  assert.deepEqual(calls.at(-1), input);
});
test('attendance saved state rejects incomplete parameters', async () => {
  const result = await dispatch({ action: 'attendance_saved_state', input: { member_id: 'M01' }, context: { authorization: 'Bearer admin' } });
  assert.equal(result.status, 400);
});
test('other attendance actions remain disconnected', async () => {
  const result = await dispatch({ action: 'attendance_batch', input: {} });
  assert.equal(result.status, 404);
});
