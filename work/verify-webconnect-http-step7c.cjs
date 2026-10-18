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
  readTeacherAttendanceToday:async input=>{calls.push(['teacherToday',input]);return {ok:true,member_count:0,attendance_items:[]};},
  readAttendanceProgressSummary:async id=>{calls.push(['progress',id]);return {ok:true,member_id:id};},
  readBillingMemberInfo:async id=>{calls.push(['billing',id]);return {ok:true,memberId:id};},
  readPaymentReceptionSummary:async input=>{calls.push(['reception',input]);return {ok:true};},
  readPaymentScreen:async input=>{calls.push(['screen',input]);return {ok:true,summary:{ok:true},confirmed:{ok:true},posted:{ok:true}};},
  acceptCashPayment:async input=>{calls.push(['cash',input]);return {ok:true,request_id:input.request_id};},
  readQrGeneratorOptions: async () => { calls.push(['qrOptions']); return { ok: true, members: [], plans: [], locations: [], teachers: [] }; }
  ,registerAttendanceBatch:async input=>{calls.push(['attendance',input]);return {ok:true,registered_count:1};}
});
let callback;
const modules = {
  'firebase-admin/app': { initializeApp: () => ({}), applicationDefault: () => ({ getAccessToken: async () => ({ access_token: 'test' }) }) },
  'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async () => ({ uid: 'admin', admin: true }) }) },
  'firebase-admin/firestore': {getFirestore:()=>({}),FieldValue:{serverTimestamp:()=>({})}},
  '../../adapters/firestore/DAO_Core.js': {createAttendanceCore:()=>({register:async()=>({ok:true})})},
  'node:http': { createServer: cb => { callback = cb; return { listen: () => {} }; } },
  '../../shared/DAO_Business.js': { createDao: () => ({}) },
  '../member-read/DAO_Core_Firestore.cjs': { createFirestoreCore: () => ({}) },
  './dojo-account-firestore.cjs': { createFirestoreDojoPrincipalResolver: () => async () => null },
  '../attendance/rank-options.cjs': { createAttendanceRankOptions: () => async () => ({}) },
  '../attendance/member-state-firestore.cjs': { createFirestoreMemberAttendanceState: () => async () => ({}) },
  '../attendance/progress-firestore.cjs': { createFirestoreProgressReader: () => async () => ({}) },
  '../billing/member-info-firestore.cjs': { createBillingMemberInfoReader: () => async () => ({}) },
  '../billing/reception-summary-firestore.cjs': { createReceptionSummaryReader: () => async () => ({}) },
  '../billing/payment-screen-firestore.cjs': { createPaymentScreenReader: () => async () => ({}) },
  '../billing/payment-cash-accept-command.cjs': {createPaymentCashAcceptCommand:()=>({execute:async input=>({ok:true,request_id:input.request_id})})},
  '../billing/payment-cash-accept-firestore.cjs': {createPaymentCashAcceptFirestoreExecutor:()=>async()=>({ok:true})},
  '../billing/payment-paypay-command.cjs': {validatePayPayPostSelected:input=>input,validatePayPayCodeStart:input=>input,validatePayPayCodeRecordBatch:input=>input},
  '../billing/payment-paypay-post-firestore.cjs': {createPayPayPostFirestoreExecutor:()=>async()=>({ok:true})},
  '../billing/payment-paypay-code-firestore.cjs': {createPayPayCodeFirestoreExecutor:()=>({start:async()=>({ok:true}),record:async()=>({ok:true})})},
  '../member-management/member-command.cjs': {createMemberManagementCommand:()=>({save:async()=>({ok:true}),withdraw:async()=>({ok:true})})},
  './admin-api.cjs': { createAdminApi: () => handle },
  './webConnect.cjs': { createDispatch },
  '../qr/generator-options.cjs': { createQrGeneratorOptions: () => async () => ({ ok: true }) },
  '../attendance/session-masters.cjs': { createSessionMasterReader: () => async () => ({}) },
  '../attendance/teacher-today-firestore.cjs': {createTeacherTodayReader:()=>async()=>({})},
  '../attendance/session-info.cjs': { createSystemSessionInfo: ({getSystemContext}) => {
    assert.equal(typeof getSystemContext,'function');return async () => ({});
  } },
  '../attendance/saved-state.cjs': { createAttendanceSavedState: () => async () => ({}) },
  '../time-travel/target.cjs': { createTimeTravelTarget: () => ({}),createAttendanceRegistrationTarget:()=>({}) }
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

test('teacher today is connected through authenticated GET and rejects POST',async()=>{
  calls=[];
  const r=await request('GET','/api/webconnect?action=teacher_attendance_today&location_id=L1&attendance_date=2026-10-26',undefined,'Bearer admin');
  assert.equal(r.status,200);assert.equal(r.body.member_count,0);assert.equal(calls[0][0],'teacherToday');
  const denied=await request('POST','/api/webconnect',{action:'teacher_attendance_today',input:{location_id:'L1'}},'Bearer admin');
  assert.equal(denied.status,405);assert.equal(calls.length,1);
});
test('progress summary uses authenticated GET and rejects POST before reader',async()=>{
  calls=[];
  assert.equal((await request('GET','/api/webconnect?action=attendance_progress_summary&member_id=M1')).status,401);
  assert.equal((await request('POST','/api/webconnect',{action:'attendance_progress_summary',input:{member_id:'M1'}},'Bearer admin')).status,405);
  assert.equal(calls.length,0);
  const result=await request('GET','/api/webconnect?action=attendance_progress_summary&member_id=M1',undefined,'Bearer admin');
  assert.equal(result.status,200);assert.equal(result.body.member_id,'M1');assert.equal(calls[0][0],'progress');
});

test('billing getMemberInfo GET is admin-only and POST is rejected before reader',async()=>{
  calls=[];
  assert.equal((await request('GET','/api/webconnect?action=getMemberInfo&member_id=M1')).status,401);
  assert.equal((await request('GET','/api/webconnect?action=getMemberInfo&member_id=M1',undefined,'Bearer member')).status,403);
  assert.equal((await request('POST','/api/webconnect',{action:'getMemberInfo',input:{member_id:'M1'}},'Bearer admin')).status,405);
  assert.equal(calls.length,0);
  assert.equal((await request('GET','/api/webconnect?action=getMemberInfo&member_id=M1',undefined,'Bearer admin')).status,200);
  assert.equal((await request('GET','/api/webconnect?action=getPaymentInfo&member_id=M1',undefined,'Bearer admin')).status,404);
  assert.equal(calls.length,1);
});

test('reception summary GET is admin-only and rejects POST before reader',async()=>{
  calls=[];const url='/api/webconnect?action=payment_reception_summary&location_id=L1&billing_block_id=B1';
  assert.equal((await request('GET',url)).status,401);
  assert.equal((await request('GET',url,undefined,'Bearer teacher')).status,403);
  assert.equal((await request('POST','/api/webconnect',{action:'payment_reception_summary',input:{}},'Bearer admin')).status,405);
  assert.equal(calls.length,0);assert.equal((await request('GET',url,undefined,'Bearer admin')).status,200);assert.equal(calls.length,1);
});

test('payment screen uses admin GET only; POST and non-admin fail before reader',async()=>{
  calls=[];const url='/api/webconnect?action=payment_screen_read&location_id=L1&billing_block_id=B1&target_month=2026-11';
  assert.equal((await request('GET',url)).status,401);assert.equal((await request('GET',url,undefined,'Bearer member')).status,403);
  assert.equal((await request('POST','/api/webconnect',{action:'payment_screen_read',input:{}},'Bearer admin')).status,405);
  assert.equal(calls.length,0);const result=await request('GET',url,undefined,'Bearer admin');assert.equal(result.status,200);
  assert.equal(result.body.confirmed.ok,true);assert.equal(calls.length,1);
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
test('attendance POST uses the same HTTP dispatcher and GET is rejected',async()=>{
  const input={teacher_id:'T1',location_id:'L1',billing_block_id:'B1',attendance_items:[{member_id:'M1',slot_ids:['S1']}]};
  calls=[];
  assert.equal((await request('GET','/api/webconnect?action=attendance_batch',undefined,'Bearer admin')).status,405);
  assert.equal(calls.length,0);
  const result=await request('POST','/api/webconnect',{action:'attendance_batch',input},'Bearer admin');
  assert.equal(result.status,200);assert.equal(result.body.registered_count,1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['attendance',input]]);
});
test('cash acceptance is POST-only in the actual HTTP dispatcher',async()=>{
  calls=[];const input={request_id:'R1',location_id:'L1',billing_block_id:'B1',items:[{member_id:'M1',billing_group_id:'G1'}]};
  assert.equal((await request('GET','/api/webconnect?action=payment_cash_accept',undefined,'Bearer admin')).status,405);
  assert.equal(calls.length,0);
  const result=await request('POST','/api/webconnect',{action:'payment_cash_accept',input},'Bearer admin');
  assert.equal(result.status,200);assert.equal(result.body.request_id,'R1');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['cash',input]]);
});
