'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const COMMON_PATH = 'web/qr/story902_e470_common.js';
const TRANSPORT_PATH = 'web/qr/story902_e470_browser_transport.js';
const NORMAL = 'https://dojo-time-travel-admin-374758850136.asia-northeast1.run.app';

function loadBrowserModules() {
  const context = vm.createContext({ URL, Object, Array, Set, Map, Date, JSON, Number, String, Boolean, Error });
  context.window = context;
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(COMMON_PATH, 'utf8'), context, { filename:COMMON_PATH });
  vm.runInContext(fs.readFileSync(TRANSPORT_PATH, 'utf8'), context, { filename:TRANSPORT_PATH });
  return context;
}

function input(expectedMinutes = 120) {
  return {
    case_id:'902-E470',
    target_month:'2026-10',
    date_from:'2026-10-01',
    date_to:'2026-10-31',
    member_ids:['ITER004DEV_MEMBER_20261020'],
    reception_scopes:[],
    expected:{attendance_minutes_by_member:{ITER004DEV_MEMBER_20261020:expectedMinutes}}
  };
}

function dependencies(context, options = {}) {
  const calls = [];
  const token = 'MUST_NOT_LEAVE_AUTH_CLIENT';
  const authClient = {
    ready:Promise.resolve(),
    getCurrentUser:() => options.authenticated === false ? null : ({
      uid:'DEV_ADMIN',
      getIdToken:async () => token
    })
  };
  const apiClient = {
    request:async (url, init) => {
      calls.push({url, init});
      return {
        status:options.status || 200,
        json:async () => options.body || ({
          ok:true,
          member_id:'ITER004DEV_MEMBER_20261020',
          attendance_by_date:[
            {attendance_date:'2026-10-05',training_minutes:120},
            {attendance_date:'2026-09-28',training_minutes:999}
          ]
        })
      };
    }
  };
  const runtimeConfig = {
    target:'dev-firebase', runtime:'firebase', apiBaseUrl:options.baseUrl || NORMAL,
    firebase:{projectId:options.projectId || 'dojo-management-dev'}
  };
  return {calls, token, authClient, apiClient, runtimeConfig,
    transport:() => context.DOJO_STORY902_E470_BROWSER.create({
      runtimeConfig, authClient, apiClient, common:context.DOJO_STORY902_E470_COMMON
    })};
}

test('browser transport uses one GET on normal DEV URL and returns E470 Judge', async () => {
  const context = loadBrowserModules(), fixture = dependencies(context);
  const result = await fixture.transport().runAttendanceProgress(input());
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].init.method, 'GET');
  assert.equal(fixture.calls[0].init.body, undefined);
  const url = new URL(fixture.calls[0].url);
  assert.equal(url.origin, NORMAL);
  assert.equal(url.pathname, '/api/webconnect');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['action','member_id']);
  assert.equal(url.searchParams.get('action'), 'attendance_progress_summary');
  assert.equal(result.actual.attendance.members.ITER004DEV_MEMBER_20261020, 120);
  assert.equal(result.judge.status, 'PASS');
});

test('token, Authorization and Firebase user never appear in result', async () => {
  const context = loadBrowserModules(), fixture = dependencies(context);
  const result = await fixture.transport().runAttendanceProgress(input());
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /MUST_NOT_LEAVE_AUTH_CLIENT|Authorization|DEV_ADMIN|Bearer/i);
  assert.equal(Object.hasOwn(result, 'headers'), false);
});

test('unauthenticated session stops before any request', async () => {
  const context = loadBrowserModules(), fixture = dependencies(context, {authenticated:false});
  await assert.rejects(() => fixture.transport().runAttendanceProgress(input()), /UNAUTHENTICATED/);
  assert.equal(fixture.calls.length, 0);
});

test('candidate, non-DEV project and non-Firebase runtime are rejected', () => {
  const context = loadBrowserModules();
  assert.throws(() => dependencies(context, {baseUrl:'https://candidate---dojo-time-travel-admin-q6ujypei6a-an.a.run.app'}).transport(), /NORMAL_REVISION_REQUIRED/);
  assert.throws(() => dependencies(context, {projectId:'dojo-management-prod'}).transport(), /FIREBASE_DEV_REQUIRED/);
  const fixture = dependencies(context);fixture.runtimeConfig.runtime='gas';
  assert.throws(() => fixture.transport(), /FIREBASE_DEV_REQUIRED/);
});

test('non-200 and mismatched member responses never produce a Judge', async () => {
  const context = loadBrowserModules();
  const denied = dependencies(context, {status:403,body:{error:'FORBIDDEN'}});
  await assert.rejects(() => denied.transport().runAttendanceProgress(input()), /WEB_CONNECT_READ_FAILED_403/);
  const mismatch = dependencies(context, {body:{ok:true,member_id:'OTHER',attendance_by_date:[]}});
  await assert.rejects(() => mismatch.transport().runAttendanceProgress(input()), /MEMBER_RESPONSE_MISMATCH/);
});

test('attendance summary exposes only the DEV E470 run function', () => {
  const html = fs.readFileSync('web/qr/attendance_summary.html','utf8');
  assert.match(html, /story902_e470_common\.js/);
  assert.match(html, /story902_e470_browser_transport\.js/);
  assert.match(html, /DOJO_RUNTIME_CONFIG\.target === 'dev-firebase'/);
  assert.match(html, /DOJO_STORY902_E470_SESSION/);
  assert.match(html, /runAttendanceProgress:story902E470Transport\.runAttendanceProgress/);
  assert.doesNotMatch(html, /getIdToken\s*\(/);
});
