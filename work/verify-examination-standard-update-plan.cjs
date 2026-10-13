'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planExistingUpdates, applyExistingUpdates } = require('./gas2firebase-copy.cjs');

const expected = {id:'ES001',fields:{examination_standard_id:'ES001',current_rank:'少年一級',next_rank:'少年初段',required_training_count:40,show_progress:false,status:'有効'}};
const actual = {...expected.fields, required_training_count:30};

test('ExaminationStandard: detect only the changed field without writing', () => {
  const plan = planExistingUpdates([expected], [actual]);
  assert.equal(plan.ok,true);
  assert.equal(plan.planned_update,1);
  assert.equal(plan.writes,0);
  assert.deepEqual(plan.items,[{id:'ES001',action:'update',fields:['required_training_count']}]);
});
test('ExaminationStandard: unchanged and unexpected field protections', () => {
  const unchanged = planExistingUpdates([expected],[expected.fields]);
  assert.equal(unchanged.planned_unchanged,1);
  assert.deepEqual(unchanged.items[0].fields,[]);
  const blocked = planExistingUpdates([expected],[{...actual,legacy:'x'}]);
  assert.equal(blocked.ok,false);
  assert.deepEqual(blocked.items[0],{id:'ES001',action:'blocked_extra_field',fields:['legacy']});
});
test('ExaminationStandard: update only changed field, with precondition and readback', async () => {
  const state = {...actual};
  const calls = [];
  const core = {
    async readByIdWithMetadata(){return {fields:{...state},updateTime:'timestamp'};},
    async updateByKey(_target,id,values,options){calls.push({id,values,options});Object.assign(state,values);},
    async readById(){return {...state};}
  };
  const result = await applyExistingUpdates([expected],[actual],core,{collection:'examination_standards'},{confirm:'dojo-management-dev'});
  assert.equal(result.ok,true);
  assert.equal(result.writes,1);
  assert.equal(result.verified,1);
  assert.deepEqual(calls,[{id:'ES001',values:{required_training_count:40},options:{updateTime:'timestamp'}}]);
  assert.deepEqual(state,expected.fields);
});
