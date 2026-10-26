'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CASE_ID,
  DEV_PROJECT_ID,
  unsupported,
  isUnsupported,
  createE470Input,
  numberOrUnsupported,
  attendanceMinutes,
  normalizeReception,
  sumSupported,
  normalizeMonthlyStatus,
  buildJudge,
  createAttendanceProgressResult
} = require('../web/qr/story902_e470_common.js');

const COMMON_READ_ACTIONS = Object.freeze([
  'attendance_progress_summary',
  'payment_reception_summary'
]);
const GAS_READ_ACTIONS = Object.freeze([...COMMON_READ_ACTIONS, 'teacher_payment_status']);
const FIREBASE_READ_ACTIONS = COMMON_READ_ACTIONS;

function createReadOnlyAdapter({ backend, baseUrl, request, getAuthorization, projectId }) {
  if (!['gas', 'firebase'].includes(backend)) throw new Error('INVALID_BACKEND');
  if (typeof request !== 'function') throw new Error('REQUEST_FUNCTION_REQUIRED');
  let endpoint;
  try { endpoint = new URL(baseUrl); } catch { throw new Error('INVALID_WEB_CONNECT_URL'); }
  if (endpoint.protocol !== 'https:') throw new Error('HTTPS_REQUIRED');
  if (backend === 'firebase' && projectId !== DEV_PROJECT_ID) throw new Error('FIREBASE_DEV_PROJECT_REQUIRED');
  const allowlist = new Set(backend === 'gas' ? GAS_READ_ACTIONS : FIREBASE_READ_ACTIONS);

  return Object.freeze({
    backend,
    project_id: backend === 'firebase' ? projectId : null,
    base_url: endpoint.toString(),
    allowed_actions: Object.freeze([...allowlist]),
    async read(action, input = {}) {
      if (!allowlist.has(action)) throw new Error('READ_ACTION_NOT_ALLOWED');
      const url = new URL(endpoint.toString());
      if (backend === 'firebase') url.pathname = `${url.pathname.replace(/\/$/, '')}/api/webconnect`;
      url.searchParams.set('action', action);
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
      }
      const authorization = typeof getAuthorization === 'function' ? await getAuthorization() : '';
      const headers = authorization ? { Authorization: authorization } : {};
      const response = await request({ method: 'GET', url: url.toString(), headers });
      if (!response || !Number.isInteger(response.status)) throw new Error('INVALID_TRANSPORT_RESPONSE');
      if (response.status !== 200) {
        const error = new Error(`WEB_CONNECT_READ_FAILED_${response.status}`);
        error.status = response.status;
        error.action = action;
        throw error;
      }
      if (!response.body || typeof response.body !== 'object' || response.body.ok !== true) {
        throw new Error('INVALID_WEB_CONNECT_BODY');
      }
      return Object.freeze({ action, status: response.status, body: response.body });
    }
  });
}

function createGasReadAdapter(options) {
  return createReadOnlyAdapter({ ...options, backend: 'gas' });
}

function createFirebaseDevReadAdapter(options) {
  return createReadOnlyAdapter({ ...options, backend: 'firebase', projectId: options && options.projectId });
}

async function runE470ReadOnly(inputValue, adapter, { now = () => new Date().toISOString() } = {}) {
  const input = createE470Input(inputValue);
  if (!adapter || typeof adapter.read !== 'function' || !['gas', 'firebase'].includes(adapter.backend)) {
    throw new Error('READ_ADAPTER_REQUIRED');
  }
  const calls = [];
  const members = {};
  for (const memberId of input.member_ids) {
    const response = await adapter.read('attendance_progress_summary', { member_id: memberId });
    calls.push({ action: response.action, status: response.status, subject: memberId });
    members[memberId] = attendanceMinutes(response.body, input.target_month);
  }
  const scopes = [];
  for (const scope of input.reception_scopes) {
    const response = await adapter.read('payment_reception_summary', scope);
    calls.push({ action: response.action, status: response.status, subject: scope });
    scopes.push(Object.freeze({ ...scope, ...normalizeReception(response.body) }));
  }
  const paymentTotals = {};
  for (const key of ['payment_count', 'cash_total', 'paypay_total', 'total_amount', 'outstanding_total']) {
    paymentTotals[key] = scopes.length ? sumSupported(scopes, key) : unsupported('no reception scope was supplied');
  }
  let monthlyBilling = unsupported('no common monthly billing summary action');
  if (adapter.backend === 'gas') {
    const response = await adapter.read('teacher_payment_status', {
      date_from: input.date_from, date_to: input.date_to, target_month: input.target_month
    });
    calls.push({ action: response.action, status: response.status, subject: input.target_month });
    monthlyBilling = normalizeMonthlyStatus(response.body);
  }
  const actual = Object.freeze({
    attendance: Object.freeze({ status: 'SUPPORTED', members: Object.freeze(members) }),
    payments: Object.freeze({ status: scopes.length ? 'SUPPORTED' : 'UNSUPPORTED', scopes: Object.freeze(scopes), totals: Object.freeze(paymentTotals) }),
    monthly_billing: monthlyBilling,
    attendance_cancellations: unsupported('no common read action exposes monthly cancellation totals'),
    examination_fees: unsupported('no common read action identifies examination-fee totals')
  });
  return Object.freeze({
    schema_version: 1,
    case_id: CASE_ID,
    backend: adapter.backend,
    project_id: adapter.project_id,
    target_month: input.target_month,
    executed_at: now(),
    mode: 'READ_ONLY',
    input,
    expected: input.expected,
    actual,
    judge: buildJudge(input.expected, actual),
    calls: Object.freeze(calls)
  });
}

function saveLocalResult(result, { outputDir = path.join(os.tmpdir(), 'story902-e470-results') } = {}) {
  if (!result || result.case_id !== CASE_ID || result.mode !== 'READ_ONLY') throw new Error('INVALID_E470_RESULT');
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = String(result.executed_at || '').replace(/[^0-9A-Za-z_-]/g, '-');
  const file = path.join(outputDir, `${CASE_ID}-${result.backend}-${stamp || Date.now()}.json`);
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return file;
}

module.exports = {
  CASE_ID,
  DEV_PROJECT_ID,
  COMMON_READ_ACTIONS,
  GAS_READ_ACTIONS,
  FIREBASE_READ_ACTIONS,
  unsupported,
  isUnsupported,
  createE470Input,
  createGasReadAdapter,
  createFirebaseDevReadAdapter,
  createAttendanceProgressResult,
  runE470ReadOnly,
  saveLocalResult
};
