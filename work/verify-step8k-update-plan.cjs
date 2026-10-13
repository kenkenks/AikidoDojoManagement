'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planExistingUpdates, parseArgs } = require('./gas2firebase-copy.cjs');
test('24 key differences plus four three-field differences; no PII in plan', () => {
  const documents = Array.from({length:24}, (_, i) => ({id:`M${String(i+1).padStart(3,'0')}`,fields:{member_id:`M${String(i+1).padStart(3,'0')}`,insurance_type:'',email:'new@example.invalid',phone:'123'}}));
  const existing = documents.map((doc, i) => i < 4 ? {insurance_type:'old@example.invalid',email:'123',phone:'-'} : {insurance_type:'',email:'new@example.invalid',phone:'123'});
  const result = planExistingUpdates(documents, existing);
  assert.equal(result.ok,true);assert.equal(result.writes,0);assert.equal(result.planned_update,24);
  assert.equal(result.items.reduce((n,item)=>n+item.fields.length,0),36);
  assert.equal(JSON.stringify(result).includes('example.invalid'),false);
});
test('missing document and extra field block update plan',()=>{
 const result=planExistingUpdates([{id:'A',fields:{member_id:'A'}},{id:'B',fields:{member_id:'B'}}],[null,{member_id:'B',legacy:'x'}]);
 assert.equal(result.ok,false);assert.equal(result.blocked,2);
 assert.deepEqual(result.items.map(x=>x.action),['missing_document','blocked_extra_field']);
});
test('same values are unchanged; missing expected field is an update',()=>{
 const result=planExistingUpdates([{id:'A',fields:{member_id:'A',insurance_type:''}},{id:'B',fields:{member_id:'B'}}],[{member_id:'A',insurance_type:''},{}]);
 assert.equal(result.planned_unchanged,1);assert.equal(result.planned_update,1);
 assert.deepEqual(result.items[1].fields,['member_id']);
});
test('mode flag parsed',()=>assert.equal(parseArgs(['--table','Member','--plan-updates']).planUpdates,true));
