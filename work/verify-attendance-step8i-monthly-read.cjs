'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const {createBillingFirestoreReader}=require('../cloud/attendance/billing-firestore.cjs');
const {monthlySelectionDocumentId}=require('../cloud/attendance/monthly-selection-key.cjs');
const member={member_id:'M1',billing_group_id:'BG1',member_type:'一般'};
const selected={billing_group_id:'BG1',target_month:'2026-10',plan_id:'P1'};
function core({canonical=null,rows=[]}={}) {return {
 readById:async ({collection},id)=>{assert.equal(collection,'monthly_selections');assert.equal(id,monthlySelectionDocumentId('BG1','2026-10'));return canonical;},
 queryEqual:async (_source,filters,opts)=>{assert.equal(opts.limit,2);assert.equal(filters[0].value,'BG1');return rows;},
 readPage:async ({collection})=>({documents:(collection==='fees'?[{plan_id:'P1','表示名':'通常','状態':'有効','回数単価':1000}]:[{member_type:'一般',selectable_plan_id:'P1'}]).map(fields=>({fields})),nextPageToken:null})
};}
function read(c){return createBillingFirestoreReader(c,{monthlySelectionCollection:'monthly_selections',targetMonth:async()=> '2026-10'})(member);}
test('canonical ID and indexed query agree: selected',async()=>{assert.equal((await read(core({canonical:selected,rows:[selected]}))).selected,true);});
test('no document on either path: genuinely unselected',async()=>{assert.equal((await read(core())).selected,false);});
test('legacy auto-ID row cannot silently become unselected',async()=>{await assert.rejects(read(core({rows:[selected]})),/LEGACY_MONTHLY_SELECTION/);});
test('canonical row without query result is inconsistent',async()=>{await assert.rejects(read(core({canonical:selected})),/IDENTITY_CONFLICT/);});
test('duplicate rows and canonical field mismatch are rejected',async()=>{await assert.rejects(read(core({canonical:selected,rows:[selected,selected]})),/DUPLICATE/);await assert.rejects(read(core({canonical:{...selected,target_month:'2026-09'},rows:[selected]})),/ID_MISMATCH/);});
test('read failure never becomes unselected',async()=>{await assert.rejects(read({...core(),readById:async()=>{throw Error('offline');}}),/offline/);});
