'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const teacher=fs.readFileSync('web/qr/attendanceCheck.html','utf8');
const member=fs.readFileSync('web/qr/attendance.html','utf8');

test('teacher attendance check exposes an authenticated dojo selector',()=>{
  assert.match(teacher,/id="locationChoiceCard" class="card" hidden/);
  assert.match(teacher,/id="locationChoice" onchange="selectLocation\(this\.value\)"/);
  assert.match(teacher,/loadAttendanceLocationOptions\(context,true\)/);
  assert.match(teacher,/action:'attendance_member_options'/);
  assert.match(teacher,/currentLocationId = String\(query\.get\("location_id"\) \|\| context\.location_id/);
});

test('dojo changes clear old state, refetch candidates, and reject stale responses',()=>{
  assert.match(teacher,/function selectLocation\(locationId\)[\s\S]*?\+\+sessionInfoRequestSeq;[\s\S]*?currentBillingBlockId='';currentSlots=\[\];[\s\S]*?clearAttendanceCheckCandidatesWhenScopeChanged[\s\S]*?loadAttendanceSessionInfo\(\)/);
  assert.match(teacher,/requestSeq=\+\+sessionInfoRequestSeq/);
  assert.match(teacher,/requestSeq!==sessionInfoRequestSeq/);
  assert.match(teacher,/renderKeys\(\)[\s\S]*?locationChoice\.value=currentLocationId/);
});

test('member inferred billing block remains a changeable initial selection',()=>{
  assert.doesNotMatch(member,/document\.getElementById\("blockChoiceCard"\)\.hidden = true/);
  assert.match(member,/renderBlockChoices\(data\.billing_block_candidates \|\| \[\], currentBillingBlockId, data\.inferred === true\)/);
  assert.match(member,/option\.selected = candidate\.billing_block_id === selectedBillingBlockId/);
  assert.match(member,/function selectBillingBlock[\s\S]*?currentSlots = \[\];[\s\S]*?clearCandidatesWhenScopeChanged[\s\S]*?refreshAttendanceSessionInfoIfNeeded\(\)/);
  assert.match(member,/billing_block_id: currentBillingBlockId/);
  assert.match(member,/slot_ids: item\.slot_ids\.slice\(\)/);
});

test('teacher home changes only the legacy attendance label contract',()=>{
  const home=fs.readFileSync('web/qr/teacher_home.html','utf8');
  assert.match(home,/href="teacher_attendance\.html">🥋 先生出席（未使用予定）<\/a>/);
});
