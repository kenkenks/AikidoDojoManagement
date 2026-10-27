'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const cases=[
  ['web/qr/paper_attendance_member.html','member_home.html','← 会員ホームへ戻る'],
  ['web/qr/paypay_code.html','member_home.html','← 会員ホームへ戻る'],
  ['web/qr/paper_attendance_review.html','teacher_home.html','← 先生ホームへ戻る'],
  ['web/qr/member_management.html','teacher_home.html','← 先生ホームへ戻る'],
  ['web/qr/paymentEvidence.html','teacher_home.html','← 先生ホームへ戻る']
];

for(const [file,href,label] of cases)test(file+' has the unified home link directly below its title',()=>{
  const html=read(file);
  const heading=html.indexOf('<h1');
  const link=html.indexOf('>'+label+'</a>',heading);
  const firstSection=html.indexOf('<section',heading);
  assert.ok(heading>=0&&link>heading&&link<firstSection);
  assert.match(html.slice(heading,firstSection),new RegExp('href="'+href.replace('.','\\.')+'"'));
});

test('existing lower home links remain',()=>{
  for(const [file,href] of cases){
    const html=read(file);
    assert.ok((html.match(new RegExp('href="'+href.replace('.','\\.')+'"','g'))||[]).length>=2,file);
  }
});

test('dynamic home parameters are copied to both paper links and both member-management links',()=>{
  const paper=read('web/qr/paper_attendance_review.js');
  const management=read('web/qr/member_management.html');
  assert.match(paper,/byId\("teacherHomeLink"\)\.href=homeHref;byId\("homeTopLink"\)\.href=homeHref/);
  assert.match(management,/teacherHomeLink"\)\.href=teacherHomeHref/);
  assert.match(management,/teacherHomeTopLink"\)\.href=teacherHomeHref/);
});

const allBusinessPages=[
  ['web/qr/attendance.html','member_home.html','← 会員ホームへ戻る'],
  ['web/qr/attendance_summary.html','member_home.html','← 会員ホームへ戻る'],
  ['web/qr/paper_attendance_member.html','member_home.html','← 会員ホームへ戻る'],
  ['web/qr/paypay_code.html','member_home.html','← 会員ホームへ戻る'],
  ['web/qr/attendanceCheck.html','teacher_home.html','← 先生ホームへ戻る'],
  ['web/qr/teacher_attendance.html','teacher_home.html','← 先生ホームへ戻る'],
  ['web/examination/member_progress.html','../qr/teacher_home.html','← 先生ホームへ戻る'],
  ['web/qr/paper_attendance_review.html','teacher_home.html','← 先生ホームへ戻る'],
  ['web/qr/member_management.html','teacher_home.html','← 先生ホームへ戻る'],
  ['web/qr/examination/index.html','../teacher_home.html','← 先生ホームへ戻る'],
  ['web/qr/qr_generator.html','teacher_home.html','← 先生ホームへ戻る'],
  ['web/qr/payment_teacher.html','teacher_home.html','← 先生ホームへ戻る'],
  ['web/qr/payment_status.html','teacher_home.html','← 先生ホームへ戻る'],
  ['web/qr/paymentEvidence.html','teacher_home.html','← 先生ホームへ戻る']
];

test('all active member and teacher business pages expose unified text links at top and bottom',()=>{
  for(const [file,href,label] of allBusinessPages){
    const html=read(file);
    const escapedHref=href.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const escapedLabel=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const links=html.match(new RegExp('<a\\b[^>]*href="'+escapedHref+'"[^>]*>'+escapedLabel+'</a>','g'))||[];
    assert.equal(links.length,2,file);
    assert.ok(!links.some(link=>/class="[^"]*button/.test(link)),file+' must use text links');
  }
});

test('entry page uses the standard responsive width without changing QR controls',()=>{
  const html=read('web/qr/index.html');
  const css=read('web/qr/common.css');
  assert.match(html,/<body class="portal page-standard">/);
  assert.match(html,/id="scanButton"[^>]*onclick="startLoginScan\(\)"/);
  assert.match(html,/id="stopButton"[^>]*onclick="stopLoginScan\(\)"/);
  assert.match(html,/id="loginReader"/);
  assert.match(css,/body\.page-standard\s*\{\s*max-width:760px;/);
  assert.match(css,/\.portal \.entry-actions button\s*\{[^}]*width:100%/);
});

test('business pages use the existing member and teacher background rules',()=>{
  const css=read('web/qr/common.css');
  assert.match(css,/body\.member\s*\{\s*background:#e8f5e9;/);
  assert.match(css,/body\.teacher\s*\{\s*background:#e3f2fd;/);
  const attendance=read('web/qr/attendance.html');
  const attendanceCheck=read('web/qr/attendanceCheck.html');
  const paymentTeacher=read('web/qr/payment_teacher.html');
  assert.match(attendance,/<body class="member page-workflow">/);
  assert.match(attendance,/background: #e8f5e9/);
  assert.match(attendanceCheck,/<body class="teacher page-workflow">/);
  assert.match(attendanceCheck,/background: #e3f2fd/);
  assert.match(paymentTeacher,/<body class="teacher page-workflow">/);
  assert.match(paymentTeacher,/background: #e3f2fd/);
  assert.match(read('web/examination/member_progress.html'),/background:#e3f2fd/);
  assert.match(read('web/qr/examination/index.html'),/background:#e3f2fd/);
});
