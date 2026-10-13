'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {copy, parseArgs, tableSchema} = require('./gas2firebase-copy.cjs');
const schema = {collection:'members', fields:[{logicalName:'member_id',physicalName:'member_id',documentId:true,type:'string'},{logicalName:'email',physicalName:'email',type:'string'}]};
// Guard tests run before GAS or Firestore access, so invalid commands never write.
test('apply-updates requires explicit single ID',async()=>{
 await assert.rejects(copy({table:'Member',applyUpdates:true,records:[],schema}),/UPDATE_ONLY_ID_REQUIRED/);
});
test('only-id cannot be used with execute',async()=>{
 await assert.rejects(copy({table:'Member',execute:true,onlyId:'M001',records:[],schema}),/COPY_ONLY_ID_MODE_INVALID/);
});
test('only-id works with master tables and rejects unknown ID',async()=>{
 for (const table of ['Fee','Rank','Teacher']) {
  await assert.rejects(copy({table,planUpdates:true,onlyId:'P001',records:[],schema:await tableSchema(table),core:{readByIds:async (target,ids)=>ids.map(()=>null)}}),/COPY_ONLY_ID_NOT_FOUND/);
 }
});
test('invalid ID rejected',async()=>{
 await assert.rejects(copy({table:'Member',planUpdates:true,onlyId:'M001,M002',records:[],schema}),/COPY_ONLY_ID_INVALID/);
});
test('CLI parses exact ID',()=>{
 assert.equal(parseArgs(['--table','Member','--plan-updates','--only-id','M001']).onlyId,'M001');
});
