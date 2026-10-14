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

test('Firestore 400 query failure exposes only safe categorical diagnostics',async()=>{
  const core=createFirestoreCore(config,{fetchImpl:async()=>({ok:false,status:400,text:async()=>JSON.stringify({error:{status:'FAILED_PRECONDITION',message:'The query requires an index. Create it here: https://example.invalid/private'}})})});
  await assert.rejects(core.queryEqual(source,[{field:'member_id',value:'M1'}]),error=>{
    assert.equal(error.message,'FIRESTORE_HTTP_400');
    assert.equal(error.firestoreOperation,'runQuery');
    assert.equal(error.firestoreCollection,'attendances');
    assert.equal(error.firestoreStatus,'FAILED_PRECONDITION');
    assert.equal(error.firestoreReason,'INDEX_REQUIRED');
    assert.doesNotMatch(JSON.stringify(error),/example\.invalid|private|M1/);
    return true;
  });
});
test('Firestore 400 malformed error body remains classifiable',async()=>{
  const core=createFirestoreCore(config,{fetchImpl:async()=>({ok:false,status:400,text:async()=>{throw Error('parse error')}})});
  await assert.rejects(core.queryEqual(source,[{field:'member_id',value:'M1'}]),error=>{
    assert.equal(error.message,'FIRESTORE_HTTP_400');
    assert.equal(error.firestoreStatus,'UNKNOWN');
    assert.equal(error.firestoreReason,'OTHER');
    return true;
  });
});

test('quotes Japanese field names while preserving ASCII paths',async()=>{
 const f=fixture([]);
 await f.core.queryEqual(source,[{field:'稽古日',value:'2026-10-11'},{field:'member_id',value:'synthetic'}]);
 const filters=JSON.parse(f.getRequest().options.body).structuredQuery.where.compositeFilter.filters;
 assert.equal(filters[0].fieldFilter.field.fieldPath,'`稽古日`');
 assert.equal(filters[1].fieldFilter.field.fieldPath,'member_id');
});
test('array error survives to API without private values in capture or logs',async()=>{
 const previous=process.env.FIRESTORE_QUERY_CAPTURE;process.env.FIRESTORE_QUERY_CAPTURE='1';
 const original=console.error; const logs=[];console.error=(...args)=>logs.push(args);
 try{
 const core=createFirestoreCore({projectId:'dojo-management-dev',mode:'development',confirmedDevelopmentProject:'dojo-management-dev'},{getAccessToken:async()=>'private-token',fetchImpl:async()=>({ok:false,status:400,text:async()=>JSON.stringify([{error:{status:'INVALID_ARGUMENT',message:'Invalid field path private-person'}}])})});
 const {createAdminApi}=require('../cloud/api/admin-api.cjs');
 const handle=createAdminApi({verifyIdToken:async()=>({uid:'test',admin:true}),getTimeTravel:async()=>({}),saveTimeTravel:async()=>({}),getSystemContext:async()=>({}),readMember:async()=>null,readMembers:async()=>[],readMemberAttendanceState:()=>core.queryEqual(source,[{field:'稽古日',value:'private-person'}])});
 const result=await handle({operation:'attendance.memberState',authorization:'Bearer synthetic',input:{member_id:'synthetic',location_id:'synthetic',billing_block_id:'synthetic',attendance_date:'2026-10-11'}});
 assert.equal(result.status,503);
 assert.deepEqual(result.body,{error:'MEMBER_STATE_UNAVAILABLE'});
 const serialized=JSON.stringify(logs);assert.match(serialized,/FIRESTORE_QUERY_CAPTURE/);assert.match(serialized,/INVALID_ARGUMENT/);assert.match(serialized,/INVALID_QUERY/);assert.doesNotMatch(serialized,/private-person|private-token|requestBody|responseBody/);
 }finally{console.error=original;if(previous===undefined)delete process.env.FIRESTORE_QUERY_CAPTURE;else process.env.FIRESTORE_QUERY_CAPTURE=previous;}
});
