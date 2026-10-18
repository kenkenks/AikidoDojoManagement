'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const {createBillingFirestoreReader}=require('../cloud/attendance/billing-firestore.cjs');
const member={member_id:'M1',billing_group_id:'BG1',member_type:'一般'};
function core(selections=[]) {return {readById:async()=>selections.length===1?selections[0]:null,queryEqual:async (_source,filters)=>{assert.equal(filters.length,2);return selections;},readPage:async ({collection})=>({documents:(collection==='fees'?[{plan_id:'P1',display_name:'通常',status:'有効',unit_price:1000}]:[{member_type:'一般',selectable_plan_id:'P1'}]).map(fields=>({fields})),nextPageToken:null})};}
const make=(c,options={})=>createBillingFirestoreReader(c,{monthlySelectionCollection:'monthly_selections',targetMonth:async()=> '2026-10',...options});
test('unselected monthly state produces eligible fee candidates',async()=>{const result=await make(core())(member);assert.equal(result.selected,false);assert.equal(result.candidates[0].plan_id,'P1');});
test('selected monthly state uses exact group and month',async()=>{const result=await make(core([{billing_group_id:'BG1',target_month:'2026-10',plan_id:'P1'}]))(member);assert.equal(result.selected,true);assert.equal(result.plan_id,'P1');});
test('schema must be explicitly confirmed; duplicate selections fail closed',async()=>{assert.throws(()=>createBillingFirestoreReader(core(),{targetMonth:async()=> '2026-10'}),/SCHEMA_UNCONFIRMED/);await assert.rejects(make(core([{plan_id:'P1'},{plan_id:'P1'}]))(member),/DUPLICATE/);});
test('storage failure and incomplete master pagination fail closed',async()=>{await assert.rejects(make({...core(),queryEqual:async()=>{throw Error('offline');}})(member),/offline/);await assert.rejects(make({...core(),readPage:async()=>({documents:[],nextPageToken:'repeat'})})(member),/PAGINATION_INCOMPLETE/);});
test('invalid month and mismatched selection fail closed',async()=>{await assert.rejects(make(core(),{targetMonth:async()=> '2026-13'})(member),/INVALID_TARGET_MONTH/);await assert.rejects(make(core([{billing_group_id:'BG2',target_month:'2026-10',plan_id:'P1'}]))(member),/(?:INVALID_MONTHLY_SELECTION|MONTHLY_SELECTION_ID_MISMATCH)/);});
