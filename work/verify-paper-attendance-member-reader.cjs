'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const review = read('web/qr/paper_attendance_review.js');
const memberHtml = read('web/qr/paper_attendance_member.html');
const teacherHtml = read('web/qr/paper_attendance_review.html');
const memberHome = read('web/qr/member_home.html');

function loadAdapter(relative) {
  const context = {window:{}};
  vm.runInNewContext(read(relative), context);
  return context.window.DOJO_PAPER_ATTENDANCE_ADAPTER;
}

const member = loadAdapter('web/qr/paper_attendance_member_adapter.js');
const teacher = loadAdapter('web/qr/paper_attendance_teacher_adapter.js');
assert.equal(member.audience, 'member');
assert.equal(member.autoApprove, false);
assert.equal(member.registrationEnabled, false);
assert.equal(teacher.audience, 'teacher');
assert.equal(teacher.autoApprove, true);
assert.equal(teacher.registrationEnabled, true);

for (const [html, adapterFile] of [[memberHtml, 'paper_attendance_member_adapter.js'], [teacherHtml, 'paper_attendance_teacher_adapter.js']]) {
  const adapterIndex = html.indexOf(adapterFile);
  const readerIndex = html.indexOf('paper_attendance_reader.js');
  const uiIndex = html.indexOf('paper_attendance_review.js');
  assert.ok(adapterIndex >= 0 && adapterIndex < readerIndex && readerIndex < uiIndex);
}
assert.ok(memberHtml.includes('id="registrationPanel" class="card hidden"'));
assert.ok(memberHtml.includes('会員ホームへ戻る'));
assert.ok(memberHome.includes('href="paper_attendance_member.html"'));
assert.equal(memberHtml.includes('paper_attendance_teacher_adapter.js'), false);
assert.equal(memberHtml.includes('paper_attendance_member.js'), false, 'member screen has no duplicate controller');
assert.equal(memberHtml.includes('attendance_firebase_read.js'), false, 'member screen does not load the existing approved-attendance writer');
assert.equal(memberHtml.includes('paper_attendance_scope.js'), false, 'member screen does not load the teacher paper registration scope');

assert.ok(review.includes('const registrationEnabled=teacherMode&&adapter.registrationEnabled===true'));
assert.ok(review.includes('function prepareRegistration(){if(!registrationEnabled||'));
assert.ok(review.includes('async function executeRegistration(){if(!registrationEnabled||'));
assert.ok(review.includes('if(memberMode)return;const nextMemberId='));
assert.ok(review.includes('session?.role==="MEMBER"?session.member_id||session.subject_id'));
assert.ok(review.includes('会員からの確認待ち送信は第4段階で接続します'));
assert.equal(review.includes('autoApprove:'), false, 'autoApprove never enters a registration payload');

console.log('PASS member paper attendance screen uses shared reader and blocks registration');
