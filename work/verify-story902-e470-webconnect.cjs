'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createE470Input,
  createGasReadAdapter,
  createFirebaseDevReadAdapter,
  runE470ReadOnly,
  saveLocalResult,
  isUnsupported
} = require('./story902-e470-webconnect.cjs');

const input = {
  case_id: '902-E470',
  target_month: '2027-07',
  date_from: '2027-07-01',
  date_to: '2027-07-31',
  member_ids: ['M001', 'M002'],
  reception_scopes: [
    { reception_date: '2027-07-02', location_id: 'HONBU', billing_block_id: 'B_KYO' },
    { reception_date: '2027-07-09', location_id: 'HONBU', billing_block_id: 'B_KYO' }
  ],
  expected: {
    attendance_minutes_by_member: { M001: 240, M002: 120 },
    payments: { payment_count: 3, cash_total: 6000, paypay_total: 4000, total_amount: 10000 },
    monthly_billing: { invoice_count: 5 }
  }
};

function responseFor(action, url) {
  const parsed = new URL(url);
  if (action === 'attendance_progress_summary') {
    const member = parsed.searchParams.get('member_id');
    return { status: 200, body: { ok: true, attendance_by_date: member === 'M001'
      ? { '2027-07-02': 120, '2027-07-09': { confirmed_minutes: 120 }, '2027-08-01': 999 }
      : [{ attendance_date: '2027-07-02', training_minutes: 120 }] } };
  }
  if (action === 'payment_reception_summary') {
    const day = parsed.searchParams.get('reception_date');
    return { status: 200, body: day.endsWith('-02')
      ? { ok: true, payment_count: 2, cash_total: 6000, paypay_total: 0, total_amount: 6000, outstanding_total: 1000 }
      : { ok: true, payment_count: 1, cash_total: 0, paypay_total: 4000, total_amount: 4000, outstanding_total: 500 } };
  }
  if (action === 'teacher_payment_status') {
    return { status: 200, body: { ok: true, summary: { invoice_count: 5, payment_count: 3, billed_total: 11500, paid_total: 10000, unpaid_total: 1500 } } };
  }
  return { status: 404, body: { error: 'UNKNOWN_ACTION' } };
}

function mockRequest(log) {
  return async request => {
    log.push(request);
    assert.equal(request.method, 'GET');
    const action = new URL(request.url).searchParams.get('action');
    return responseFor(action, request.url);
  };
}

test('E470 input DTO validates identity, month and explicit subjects', () => {
  const dto = createE470Input(input);
  assert.equal(dto.case_id, '902-E470');
  assert.equal(dto.member_ids.length, 2);
  assert.throws(() => createE470Input({ ...input, case_id: '902-E010' }), /INVALID_CASE_ID/);
  assert.throws(() => createE470Input({ ...input, target_month: '2027-13' }), /INVALID_TARGET_MONTH/);
  assert.throws(() => createE470Input({ ...input, member_ids: [] }), /MEMBER_IDS_REQUIRED/);
});

test('read adapters allow only explicit GET actions and Firebase DEV', async () => {
  const gasCalls = [];
  const gas = createGasReadAdapter({ baseUrl: 'https://script.google.com/macros/s/test/exec', request: mockRequest(gasCalls) });
  await gas.read('attendance_progress_summary', { member_id: 'M001' });
  assert.equal(gasCalls.length, 1);
  await assert.rejects(() => gas.read('attendance_batch', {}), /READ_ACTION_NOT_ALLOWED/);
  assert.throws(() => createFirebaseDevReadAdapter({ projectId: 'production', baseUrl: 'https://example.run.app', request: mockRequest([]) }), /FIREBASE_DEV_PROJECT_REQUIRED/);
});

test('GAS mock is normalized and judged with monthly status', async () => {
  const calls = [];
  const adapter = createGasReadAdapter({ baseUrl: 'https://script.google.com/macros/s/test/exec', request: mockRequest(calls) });
  const result = await runE470ReadOnly(input, adapter, { now: () => '2026-10-24T00:00:00.000Z' });
  assert.equal(result.mode, 'READ_ONLY');
  assert.equal(result.actual.attendance.members.M001, 240);
  assert.equal(result.actual.payments.totals.total_amount, 10000);
  assert.equal(result.actual.monthly_billing.invoice_count, 5);
  assert.equal(result.judge.status, 'PASS');
  assert.ok(calls.every(call => call.method === 'GET'));
});

test('Firebase mock marks unavailable monthly fields UNSUPPORTED, never zero', async () => {
  const calls = [];
  const adapter = createFirebaseDevReadAdapter({
    projectId: 'dojo-management-dev',
    baseUrl: 'https://candidate.example.run.app',
    getAuthorization: async () => 'Bearer mock-token',
    request: mockRequest(calls)
  });
  const result = await runE470ReadOnly(input, adapter, { now: () => '2026-10-24T00:00:00.000Z' });
  assert.equal(result.judge.status, 'PARTIAL');
  assert.ok(isUnsupported(result.actual.monthly_billing));
  assert.equal(result.judge.unsupported, 1);
  assert.ok(calls.every(call => call.headers.Authorization === 'Bearer mock-token'));
  assert.ok(calls.every(call => new URL(call.url).pathname.endsWith('/api/webconnect')));
});

test('missing response metrics propagate as UNSUPPORTED', async () => {
  const adapter = createFirebaseDevReadAdapter({
    projectId: 'dojo-management-dev', baseUrl: 'https://candidate.example.run.app',
    request: async request => {
      const action = new URL(request.url).searchParams.get('action');
      return action === 'attendance_progress_summary'
        ? { status: 200, body: { ok: true } }
        : { status: 200, body: { ok: true, payment_count: 0 } };
    }
  });
  const result = await runE470ReadOnly({ ...input, expected: { attendance_minutes_by_member: { M001: 0 }, payments: { total_amount: 0 } } }, adapter);
  assert.equal(result.judge.status, 'PARTIAL');
  assert.ok(isUnsupported(result.actual.attendance.members.M001));
  assert.ok(isUnsupported(result.actual.payments.totals.total_amount));
});

test('local result saving writes one JSON file outside the repository by default-compatible contract', async () => {
  const adapter = createFirebaseDevReadAdapter({
    projectId: 'dojo-management-dev', baseUrl: 'https://candidate.example.run.app', request: mockRequest([])
  });
  const result = await runE470ReadOnly({ ...input, expected: {} }, adapter, { now: () => '2026-10-24T00:00:00.000Z' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'story902-e470-test-'));
  try {
    const file = saveLocalResult(result, { outputDir: dir });
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).case_id, '902-E470');
    assert.throws(() => saveLocalResult(result, { outputDir: dir }), /EEXIST/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
