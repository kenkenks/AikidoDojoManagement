'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {classifyHit}=require('../tools/classify-member-migration-references.cjs');
const {buildPlan,applyPlan}=require('../tools/apply-member-migration-references.cjs');

test('same line: member occurrence REPLACE, teacher occurrence not REPLACE',()=>{
 const line='return member["氏名"] || teacher["氏名"];';
 const c1=line.indexOf('氏名')+1,c2=line.lastIndexOf('氏名')+1;
 assert.equal(classifyHit('氏名',{text:line,raw_text:line,column:c1},'gas/16_TeacherAttendance.js').classification,'REPLACE');
 assert.notEqual(classifyHit('氏名',{text:line,raw_text:line,column:c2},'gas/16_TeacherAttendance.js').classification,'REPLACE');
});
test('row field is REVIEW because table provenance is unknown',()=>{
 const line='const x = row["現在級段位"];',c=line.indexOf('現在級段位')+1;
 assert.equal(classifyHit('現在級段位',{text:line,raw_text:line,column:c},'gas/04_ExaminationStandard.js').classification,'REVIEW');
});
test('header lookup is REVIEW',()=>{
 const line='const i = headers.indexOf("氏名");',c=line.indexOf('氏名')+1;
 assert.equal(classifyHit('氏名',{text:line,raw_text:line,column:c},'gas/08_MemberCard.js').classification,'REVIEW');
});
test('applicator changes one occurrence by column only',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'member-safe-'));fs.mkdirSync(path.join(root,'gas'));
 const line='return member["氏名"] || teacher["氏名"];';
 fs.writeFileSync(path.join(root,'gas/x.js'),line+'\n');
 const col=line.indexOf('氏名')+1;
 const c={entity:'member',results:[{before:'氏名',after:'member_name',action:'classified',files:[{file:'gas/x.js',hits:[{line:1,column:col,text:line,classification:'REPLACE',reason:'explicit-member-field'}]}]}]};
 const p=buildPlan(c,root);assert.equal(p.stale_count,0);applyPlan(p,root);
 assert.equal(fs.readFileSync(path.join(root,'gas/x.js'),'utf8'),'return member["member_name"] || teacher["氏名"];\n');
});
