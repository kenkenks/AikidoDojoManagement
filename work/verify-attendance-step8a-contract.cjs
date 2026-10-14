'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const root = join(__dirname, '..');
const core = require('../shared/WebConnectCore.js');
const read = p => readFileSync(join(root,p),'utf8');
test('attendance operations classified by shared route', () => {
  const expected = {
    attendance_session_info:'attendance.sessionInfo',
    attendance_saved_state:'attendance.savedState',
    member_attendance_state:'attendance.memberState',
    attendance_rank_options:'attendance.rankOptions',
    post_receipt:'attendance.postReceipt'
  };
  for (const [action, operation] of Object.entries(expected)) {
    assert.equal(core.route({method:'GET',action,params:{}})?.operation,operation);
  }
  assert.equal(core.route({method:'POST',action:'attendance_batch',data:{}})?.operation,'attendance.registerBatch');
});
test('only existing two attendance reads resolve in Cloud Run dispatcher', () => {
  for (const action of ['attendance_session_info','attendance_saved_state']) assert.ok(core.resolve(action,{}));
  for (const action of ['member_attendance_state','attendance_rank_options','post_receipt','attendance_batch']) assert.equal(core.resolve(action,{}),null);
});
test('attendance page still uses GAS transport (migration not complete)', () => {
  const html=read('web/qr/attendance.html');
  assert.match(html,/jsonp\(GAS_URL/);
  assert.match(html,/postJsonViaForm\(GAS_URL/);
  assert.match(html,/source: "github_pages_qr"/);
});
test('connected attendance reads currently require admin authorization', () => {
  const admin=read('cloud/api/admin-api.cjs');
  assert.match(admin,/user\.admin !== true/);
  assert.match(admin,/operation === 'attendance\.sessionInfo'/);
  assert.match(admin,/operation === 'attendance\.savedState'/);
});
