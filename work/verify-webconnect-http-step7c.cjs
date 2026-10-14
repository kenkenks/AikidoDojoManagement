'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const { createDispatch } = require('../cloud/api/webConnect.cjs');
const { createAdminApi } = require('../cloud/api/admin-api.cjs');

// Exercise the actual HTTP callback without opening a port or using live credentials.
const serverSource = fs.readFileSync(path.join(__dirname, '../cloud/api/server.cjs'), 'utf8');
const root = path.resolve(__dirname, '..');
let calls = [];
const handle = createAdminApi({
  verifyIdToken: async token => token === 'admin' ? { uid: 'admin', admin: true } : { uid: token, admin: false },
  getTimeTravel: async () => ({ enabled: true }),
  saveTimeTravel: async input => ({ ok: true, input }),
  getSystemContext: async () => ({ ok: true, system_now: '2026-10-13 10:00:00', target_month: '2026-10', time_travel_enabled: false }),
  readMember: async id => { calls.push(['member', id]); return { id }; },
  readMembers: async ids => { calls.push(['members', ids]); return ids.map(id => ({ id })); },
  readAttendanceSavedState: async input => { calls.push(['saved', input]); return { ok: true }; },
  readAttendanceSessionInfo: async input => { calls.push(['session', input]); return { ok: true }; },
  readQrGeneratorOptions: async () => { calls.push(['qrOptions']); return { ok: true, members: [], plans: [], locations: [], teachers: [] }; }
});
let callback;
const modules = {
  'firebase-admin/app': { initializeApp: () => ({}), applicationDefault: () => ({ getAccessToken: async () => ({ access_token: 'test' }) }) },
  'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async () => ({ uid: 'admin', admin: true }) }) },
  'node:http': { createServer: cb => { callback = cb; return { listen: () => {} }; } },
  '../../shared/DAO_Business.js': { createDao: () => ({}) },
  '../member-read/DAO_Core_Firestore.cjs': { createFirestoreCore: () => ({}) },
  './admin-api.cjs': { createAdminApi: () => handle },
  './webConnect.cjs': { createDispatch },
  '../qr/generator-options.cjs': { createQrGeneratorOptions: () => async () => ({ ok: true }) },
  '../attendance/session-masters.cjs': { createSessionMasterReader: () => async () => ({}) },
  '../attendance/session-info.cjs': { createSessionInfo: () => async () => ({}) },
  '../attendance/saved-state.cjs': { createAttendanceSavedState: () => async () => ({}) },
  '../time-travel/target.cjs': { createTimeTravelTarget: () => ({}) }
};
vm.runInNewContext(serverSource, {
  require: name => Object.hasOwn(modules, name) ? modules[name] : require(name),
  __dirname: path.join(root, 'cloud/api'), process: { env: {} }, console: { log() {}, error() {} },
  Buffer, URL, Set
}, { filename: 'cloud/api/server.cjs' });
async function request(method, url, body, authorization) {
  const payload = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  const req = Readable.from(payload);
  req.method = method; req.url = url; req.headers = { authorization };
  let status, headers, content = '';
  const res = { writeHead(s, h) { status = s; headers = h; }, end(v) { content = v || ''; } };
  await callback(req, res);
  return { status, headers, body: JSON.parse(content) };
}
test('GET reaches public SystemContext through actual HTTP callback', async () => {
  const r = await request('GET', '/api/webconnect?action=system_context');
  assert.equal(r.status, 200); assert.equal(r.body.target_month, '2026-10');
});
test('GET authenticated member and session info reach existing handler', async () => {
  calls = [];
  const member = await request('GET', '/api/webconnect?action=member_read&member_id=M001', undefined, 'Bearer admin');
  const session = await request('GET', '/api/webconnect?action=attendance_session_info&location_id=L001', undefined, 'Bearer admin');
  assert.equal(member.status, 200); assert.equal(session.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['member', 'M001'], ['session', { action: 'attendance_session_info', location_id: 'L001' }]]);
});
test('POST batch read delegates JSON input through operation', async () => {
  calls = [];
  const r = await request('POST', '/api/webconnect', { action: 'members_read', input: { ids: ['M1', 'M2'] } }, 'Bearer admin');
  assert.equal(r.status, 200); assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['members', ['M1', 'M2']]]);
});
test('unauthenticated and non-admin requests cannot reach DAO', async () => {
  calls = [];
  assert.equal((await request('GET', '/api/webconnect?action=member_read&member_id=M1')).status, 401);
  assert.equal((await request('GET', '/api/webconnect?action=member_read&member_id=M1', undefined, 'Bearer teacher')).status, 403);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), []);
});
test('HTTP method mismatch, unknown action and invalid JSON fail closed', async () => {
  calls = [];
  assert.equal((await request('POST', '/api/webconnect', { action: 'member_read', input: { member_id: 'M1' } }, 'Bearer admin')).status, 405);
  assert.equal((await request('GET', '/api/webconnect?action=members_read', undefined, 'Bearer admin')).status, 405);
  assert.equal((await request('GET', '/api/webconnect?action=unknown', undefined, 'Bearer admin')).status, 404);
  assert.equal((await request('POST', '/api/webconnect', '{bad', 'Bearer admin')).status, 400);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), []);
});

test('QR options uses Dispatcher with admin authorization only', async () => {
  calls = [];
  assert.equal((await request('GET', '/api/webconnect?action=qr_generator_options')).status, 401);
  assert.equal((await request('GET', '/api/webconnect?action=qr_generator_options', undefined, 'Bearer teacher')).status, 403);
  assert.deepEqual(calls, []);
  const result = await request('GET', '/api/webconnect?action=qr_generator_options', undefined, 'Bearer admin');
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.deepEqual(calls, [['qrOptions']]);
  assert.equal((await request('POST', '/api/webconnect', { action: 'qr_generator_options' }, 'Bearer admin')).status, 405);
});
