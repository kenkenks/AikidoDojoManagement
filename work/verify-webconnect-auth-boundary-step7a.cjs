'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
const { createDispatch } = require('../cloud/api/webConnect.cjs');

const calls = [];
const handle = createAdminApi({
  verifyIdToken: async (token, checkRevoked) => {
    assert.equal(checkRevoked, true);
    if (token === 'revoked') throw new Error('revoked');
    if (token === 'admin') return { uid: 'A', admin: true };
    if (token === 'teacher') return { uid: 'T', teacher: true, admin: false };
    if (token === 'member') return { uid: 'M', admin: false };
    return { uid: 'X' };
  },
  getSystemContext: async () => { calls.push('system'); return { ok: true, system_now: '2026-10-13T09:00:00+09:00', target_month: '2026-10', time_travel_enabled: false }; },
  getTimeTravel: async () => { calls.push('timeRead'); return { ok: true }; },
  saveTimeTravel: async () => { calls.push('timeSave'); return { ok: true }; },
  readMember: async () => { calls.push('member'); return { id: 'M1' }; },
  readMembers: async () => { calls.push('members'); return []; },
  readAttendanceSavedState: async () => { calls.push('saved'); return { ok: true }; },
  readAttendanceSessionInfo: async () => { calls.push('session'); return { ok: true }; }
});
const dispatch = createDispatch(handle);
const cases = [
  ['time_travel_admin', {}],
  ['time_travel_set', { enabled: false }],
  ['member_read', { member_id: 'M1' }],
  ['members_read', { ids: ['M1'] }],
  ['attendance_saved_state', { member_id: 'M1', location_id: 'L1', billing_block_id: 'B1', attendance_date: '2026-10-13' }],
  ['attendance_session_info', { location_id: 'L1' }]
];
test('all protected operations deny anonymous before invoking domain functions', async () => {
  for (const [action, input] of cases) {
    calls.length = 0;
    assert.equal((await dispatch({ action, input })).status, 401, action);
    assert.deepEqual(calls, [], action);
  }
});
test('teacher claims alone do not grant admin operations', async () => {
  for (const [action, input] of cases) {
    calls.length = 0;
    assert.equal((await dispatch({ action, input, context: { authorization: 'Bearer teacher' } })).status, 403, action);
    assert.deepEqual(calls, [], action);
  }
});
test('member claims alone do not grant admin operations', async () => {
  for (const [action, input] of cases) {
    calls.length = 0;
    assert.equal((await dispatch({ action, input, context: { authorization: 'Bearer member' } })).status, 403, action);
    assert.deepEqual(calls, [], action);
  }
});
test('revoked tokens deny access before domain calls', async () => {
  for (const [action, input] of cases) {
    calls.length = 0;
    assert.equal((await dispatch({ action, input, context: { authorization: 'Bearer revoked' } })).status, 401, action);
    assert.deepEqual(calls, [], action);
  }
});
test('admin token permits existing protected operations', async () => {
  for (const [action, input] of cases) {
    calls.length = 0;
    assert.equal((await dispatch({ action, input, context: { authorization: 'Bearer admin' } })).status, 200, action);
    assert.equal(calls.length, 1, action);
  }
});
test('public system context stays accessible without login and returns no admin data', async () => {
  calls.length = 0;
  const result = await dispatch({ action: 'system_context' });
  assert.equal(result.status, 200);
  assert.deepEqual(calls, ['system']);
  assert.equal(result.body.admin, undefined);
  assert.equal(result.body.members, undefined);
});
test('unconnected teacher and member actions fail closed for every role', async () => {
  for (const action of ['teacher_attendance_today', 'member_attendance_state', 'attendance_batch', 'payment_status']) {
    for (const token of [null, 'admin', 'teacher', 'member']) {
      calls.length = 0;
      const context = token ? { authorization: `Bearer ${token}` } : undefined;
      assert.equal((await dispatch({ action, input: {}, context })).status, 404, `${action}/${token}`);
      assert.deepEqual(calls, []);
    }
  }
});
