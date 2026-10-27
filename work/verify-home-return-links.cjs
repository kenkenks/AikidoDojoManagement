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
