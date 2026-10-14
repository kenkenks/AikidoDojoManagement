'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createBillingSelectionReader} = require('../cloud/attendance/billing-selection.cjs');
const member = {member_id:'M1',billing_group_id:'BG1',member_type:'一般'};
const fees = [{plan_id:'P1','表示名':'月額','会費タイプ':'月額','回数単価':500,'上限金額':4000,'状態':'有効'},
 {plan_id:'P2','表示名':'停止','状態':'無効'}];
const setup = overrides => createBillingSelectionReader({readMonthlySelection:async()=>null,
 readFees:async()=>fees, readPlanSelectionRules:async()=>[{member_type:'一般',selectable_plan_id:'P1'}, {member_type:'一般',selectable_plan_id:'P1'}],
 targetMonth:async()=> '2026-10', ...overrides});
test('unselected month returns deduplicated candidate with GAS field names',async()=>{
 const x=await setup()(member); assert.equal(x.selected,false); assert.equal(x.plan_id,'');
 assert.deepEqual(x.candidates,[{plan_id:'P1',plan_name:'月額',fee_type:'月額',amount:500,cap_amount:4000}]);
});
test('selected month returns one active plan',async()=>{
 const x=await setup({readMonthlySelection:async()=>({plan_id:'P1'})})(member);
 assert.equal(x.selected,true); assert.equal(x.plan_name,'月額'); assert.equal(x.candidates.length,1);
});
test('failed read is not converted to unselected or free',async()=>{
 await assert.rejects(setup({readMonthlySelection:async()=>{throw Error('network');}})(member),/network/);
 await assert.rejects(setup({readFees:async()=>null})(member),/INVALID_BILLING_MASTER/);
});
test('inactive or unknown plan and invalid money fail closed',async()=>{
 await assert.rejects(setup({readMonthlySelection:async()=>({plan_id:'P2'})})(member),/UNKNOWN_OR_INACTIVE_PLAN/);
 await assert.rejects(setup({readFees:async()=>[{plan_id:'P1','回数単価':'oops'}]})(member),/INVALID_FEE_AMOUNT/);
});
test('invalid month and duplicate active plan fail closed',async()=>{
 await assert.rejects(setup({targetMonth:async()=> 'bad'})(member),/INVALID_TARGET_MONTH/);
 await assert.rejects(setup({readFees:async()=>[fees[0],fees[0]]})(member),/INVALID_OR_DUPLICATE_FEE/);
});
