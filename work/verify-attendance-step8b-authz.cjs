'use strict';
// Step 8B: executable authorization boundary contract (no live Firebase or Firestore).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');
const { createDispatch } = require('../cloud/api/webConnect.cjs');
const WebConnectCore = require('../shared/WebConnectCore.js');

const calls = [];
const handle = createAdminApi({
  verifyIdToken: async token => {
    if (token === 'invalid') throw new Error('invalid token');
    if (token === 'admin') return { uid: 'admin-uid', admin: true };
    if (token === 'member') return { uid: 'member-uid', member_id: 'M001' };
    if (token === 'teacher') return { uid: 'teacher-uid', teacher_id: 'T001' };
    return { uid: 'unknown-uid' };
  },
  getTimeTravel: async () => ({ ok: true }),
  saveTimeTravel: async () => ({ ok: true }),
  getSystemContext: async () => ({ ok: true, system_now: '2026-10-14 10:00:00', target_month: '2026-10', time_travel_enabled: false }),
  readMember: async id => { calls.push(['member', id]); return { member_id: id }; },
  readMembers: async ids => { calls.push(['members', ids]); return []; },
  readAttendanceSavedState: async input => { calls.push(['saved', input]); return { ok: true }; },
  readAttendanceSessionInfo: async input => { calls.push(['session', input]); return { ok: true }; },
  readQrGeneratorOptions: async () => { calls.push(['options']); return { ok: true }; }
});
const dispatch = createDispatch(handle);
const call = (action, input, token) => dispatch({ action, input, context: { authorization: token ? `Bearer ${token}` : '' } });
const saved = { member_id: 'M001', location_id: 'L001', billing_block_id: 'BG001', attendance_date: '2026-10-14' };

test('attendance reads require verified admin today; member/teacher QR or virtual role cannot elevate', async () => {
  calls.length = 0;
  for (const action of ['attendance_session_info', 'attendance_saved_state']) {
    const input = action === 'attendance_saved_state' ? saved : { location_id: 'L001' };
    for (const token of [null, 'invalid', 'member', 'teacher', 'unknown']) {
      const response = await call(action, { ...input, role: 'ADMIN', admin: true, member_id: 'M001' }, token);
      assert.equal(response.status, token === null || token === 'invalid' ? 401 : 403, `${action}/${token}`);
    }
  }
  assert.deepEqual(calls, [], 'unauthorized reads must not invoke DAO');
});

test('admin read uses existing operation and DAO without widening access', async () => {
  calls.length = 0;
  const r1 = await call('attendance_session_info', { location_id: 'L001' }, 'admin');
  const r2 = await call('attendance_saved_state', saved, 'admin');
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.deepEqual(calls.map(x => x[0]), ['session', 'saved']);
});

test('unconnected attendance write and receipt fail closed even for admin', async () => {
  calls.length = 0;
  for (const action of ['attendance_batch', 'post_receipt', 'member_attendance_state', 'attendance_rank_options']) {
    assert.equal((await call(action, { member_id: 'M001' }, 'admin')).status, 404, action);
  }
  assert.deepEqual(calls, []);
});

test('URL member_id is not Firebase identity and virtual session is browser-only', () => {
  const attendance = fs.readFileSync(path.join(__dirname, '../web/qr/attendance.html'), 'utf8');
  const virtual = fs.readFileSync(path.join(__dirname, '../web/qr/virtual_session.js'), 'utf8');
  assert.match(attendance, /query\.get\("member_id"\)/);
  assert.match(attendance, /DojoVirtualSession\.loginMember\(urlMemberId/);
  assert.match(virtual, /loginMember:/);
  assert.equal(WebConnectCore.resolve('attendance_batch', {}), null);
  assert.equal(WebConnectCore.resolve('post_receipt', {}), null);
});
