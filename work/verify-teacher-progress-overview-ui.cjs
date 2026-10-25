'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('web/qr/attendanceCheck.html','utf8');
const read=fs.readFileSync('web/qr/attendance_firebase_read.js','utf8');
const home=fs.readFileSync('web/qr/teacher_home.html','utf8');
const loader=html.slice(html.indexOf('    function loadTeacherAttendanceOverview('),html.indexOf('    function renderTeacherOverview('));
const renderer=html.slice(html.indexOf('    function renderTeacherOverview('),html.indexOf('    function addMemberCandidate('));

assert.match(home,/href="attendanceCheck\.html">📅 出席・稽古進捗</);
assert.match(html,/全会員の稽古・審査進捗/);
assert.match(loader,/IS_FIREBASE_ATTENDANCE\?\{action:"teacher_attendance_progress"\}/);
assert.match(loader,/data\.progress_items:data\.attendance_items/);
assert.doesNotMatch(loader,/attendance_progress_summary/);
assert.match(read,/"teacher_attendance_progress"/);
assert.match(renderer,/mode === "rank"/);
assert.match(renderer,/remaining_training_count/);
assert.match(renderer,/recorded_training_count/);
assert.match(renderer,/progress_percent/);
assert.match(renderer,/item\.forecast_label/);
assert.match(renderer,/残り"\+item\.remaining_training_count\+"枠/);
assert.match(renderer,/必要 "\+item\.required_training_count\+"枠/);
assert.doesNotMatch(renderer,/required_training_count \+ "H"/);
assert.match(html,/全会員の進捗を読み込み中/);
assert.match(html,/表示対象の在籍会員はいません/);
assert.match(html,/直近90日の承認済み稽古実績に基づく参考値/);
assert.match(html,/className = "error"/);
console.log('PASS teacher progress overview UI contract');
