'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildPlan, applyPlan } = require('../tools/apply-member-migration-references.cjs');

function tempRepo(line) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'member-applicator-'));
  fs.mkdirSync(path.join(root, 'gas'));
  fs.writeFileSync(path.join(root, 'gas/x.js'), line + '\n', 'utf8');
  return root;
}
function classified(before, after, line, column, classification='REPLACE') {
  return {
    entity: 'member',
    results: [{
      before, after, action: 'classified',
      files: [{ file: 'gas/x.js', hits: [{
        line: 1, column, text: line, classification, reason: 'test'
      }]}]
    }]
  };
}

test('dry-run includes only REPLACE hits', () => {
  const line = 'const x = member["氏名"];';
  const root = tempRepo(line);
  const col = line.indexOf('氏名') + 1;
  const p = buildPlan(classified('氏名','member_name',line,col), root);
  assert.equal(p.replacement_count, 1);
  assert.equal(p.stale_count, 0);
});

test('non-REPLACE hit is not planned', () => {
  const line = 'const x = teacher["氏名"];';
  const root = tempRepo(line);
  const col = line.indexOf('氏名') + 1;
  const p = buildPlan(classified('氏名','member_name',line,col,'REVIEW'), root);
  assert.equal(p.replacement_count, 0);
});

test('stale source is rejected', () => {
  const line = 'const x = member["氏名"];';
  const root = tempRepo(line);
  const col = line.indexOf('氏名') + 1;
  const c = classified('氏名','member_name',line,col);
  fs.writeFileSync(path.join(root,'gas/x.js'),'const changed = true;\n','utf8');
  const p = buildPlan(c, root);
  assert.equal(p.stale_count, 1);
  assert.throws(() => applyPlan(p, root), /PDD_MEMBER_APPLY_STALE_SCAN/);
});

test('apply changes only the planned occurrence on a mixed line', () => {
  const line = 'return member["氏名"] || teacher["氏名"];';
  const root = tempRepo(line);
  const col = line.indexOf('氏名') + 1;
  const p = buildPlan(classified('氏名','member_name',line,col), root);
  const r = applyPlan(p, root);
  assert.equal(r.replacements, 1);
  assert.equal(fs.readFileSync(path.join(root,'gas/x.js'),'utf8'),
    'return member["member_name"] || teacher["氏名"];\n');
});

test('multiple different fields on same line use recorded columns right-to-left', () => {
  const line = 'return member["氏名"] + member["状態"];';
  const root = tempRepo(line);
  const c = {
    entity:'member',
    results:[
      {before:'氏名',after:'member_name',action:'classified',files:[{file:'gas/x.js',hits:[{
        line:1,column:line.indexOf('氏名')+1,text:line,classification:'REPLACE',reason:'test'}]}]},
      {before:'状態',after:'status',action:'classified',files:[{file:'gas/x.js',hits:[{
        line:1,column:line.indexOf('状態')+1,text:line,classification:'REPLACE',reason:'test'}]}]}
    ]
  };
  const p=buildPlan(c,root);
  assert.equal(p.stale_count,0);
  const r=applyPlan(p,root);
  assert.equal(r.replacements,2);
  assert.equal(fs.readFileSync(path.join(root,'gas/x.js'),'utf8'),
    'return member["member_name"] + member["status"];\n');
});

test('planning does not mutate repository', () => {
  const line='const x = member["氏名"];';
  const root=tempRepo(line), before=fs.readFileSync(path.join(root,'gas/x.js'),'utf8');
  buildPlan(classified('氏名','member_name',line,line.indexOf('氏名')+1),root);
  assert.equal(fs.readFileSync(path.join(root,'gas/x.js'),'utf8'),before);
});
