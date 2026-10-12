'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createFirestoreCore} = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const config = {projectId:'demo-attendance',mode:'emulator',host:'127.0.0.1:8080'};
const source = {collection:'attendances'};
function fixture(body) {
  let request;
  const core = createFirestoreCore(config,{fetchImpl:async(url,options)=>{
    request = {url,options};
    return {ok:true,text:async()=>JSON.stringify(body)};
  }});
  return {core, getRequest:()=>request};
}
test('bounded scope query constructs AND filters and decodes attendance records',async()=>{
  const f=fixture([{document:{name:'projects/demo-attendance/databases/(default)/documents/attendances/A1',fields:{member_id:{stringValue:'M1'},training_minutes:{integerValue:'60'}}}}]);
  const rows=await f.core.queryEqual(source,[{field:'member_id',value:'M1'},{field:'attendance_date',value:'2026-10-11'}],{limit:50});
  assert.deepEqual(rows,[{member_id:'M1',training_minutes:60}]);
  const req=f.getRequest();
  assert.match(req.url,/:runQuery$/);
  const q=JSON.parse(req.options.body).structuredQuery;
  assert.equal(q.from[0].collectionId,'attendances');
  assert.equal(q.where.compositeFilter.filters.length,2);
  assert.equal(q.limit,50);
});
test('rejects unbounded, invalid, or oversized queries without network access',async()=>{
  const f=fixture([]);
  await assert.rejects(f.core.queryEqual(source,[]),/INVALID_QUERY/);
  await assert.rejects(f.core.queryEqual(source,[{field:'member_id',value:'M1'}],{limit:501}),/INVALID_QUERY/);
  await assert.rejects(f.core.queryEqual(source,[{field:'__name__',value:'M1'}]),/INVALID_QUERY/);
  assert.equal(f.getRequest(),undefined);
});
test('accepts Firestore metadata-only rows and empty results',async()=>{
  const f=fixture([{readTime:'2026-10-11T00:00:00Z'}]);
  assert.deepEqual(await f.core.queryEqual(source,[{field:'member_id',value:'M1'}]),[]);
});
test('rejects a document outside the queried collection',async()=>{
  const f=fixture([{document:{name:'projects/demo-attendance/databases/(default)/documents/members/M1',fields:{}}}]);
  await assert.rejects(f.core.queryEqual(source,[{field:'member_id',value:'M1'}]),/INVALID_QUERY_RESPONSE/);
});
