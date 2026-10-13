'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {copy, parseArgs} = require('./gas2firebase-copy.cjs');
const schema = {collection:'members', fields:[{logicalName:'member_id',physicalName:'member_id',documentId:true,type:'string'},{logicalName:'email',physicalName:'email',type:'string'}]};
// Guard tests run before GAS or Firestore access, so invalid commands never write.
test('apply-updates requires explicit single ID',async()=>{
 await assert.rejects(copy({table:'Member',applyUpdates:true,records:[],schema}),/UPDATE_ONLY_ID_REQUIRED/);
});
test('only-id cannot be used with execute',async()=>{
 await assert.rejects(copy({table:'Member',execute:true,onlyId:'M001',records:[],schema}),/COPY_ONLY_ID_MODE_INVALID/);
});
test('only-id cannot be used on other tables',async()=>{
 await assert.rejects(copy({table:'Teacher',planUpdates:true,onlyId:'M001',records:[],schema}),/COPY_ONLY_ID_MODE_INVALID/);
});
test('invalid ID rejected',async()=>{
 await assert.rejects(copy({table:'Member',planUpdates:true,onlyId:'M001,M002',records:[],schema}),/COPY_ONLY_ID_INVALID/);
});
test('CLI parses exact ID',()=>{
 assert.equal(parseArgs(['--table','Member','--plan-updates','--only-id','M001']).onlyId,'M001');
});
