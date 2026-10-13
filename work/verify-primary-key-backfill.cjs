'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {repair}=require('./repair-firestore-primary-keys.cjs');
const {renderFirestoreDocuments,verifyFirestoreDocuments,restoreFirestoreRecord}=require('../shared/Schema_Renderer_Firestore.js');
const schema={collection:'dojos',documentIdField:'location_id',fields:[{logicalName:'location_id',physicalName:'location_id',type:'string',documentId:true,required:true},{logicalName:'状態',physicalName:'status',type:'string'}]};
test('new copies preserve physical primary-key field',()=>{
 const [doc]=renderFirestoreDocuments(schema,[{location_id:'HONBU',状態:'有効'}],{includeDocumentIdField:true});
 assert.deepEqual(doc,{id:'HONBU',fields:{location_id:'HONBU',status:'有効'}});
 assert.equal(verifyFirestoreDocuments(schema,[doc]).ok,true);
 assert.deepEqual(restoreFirestoreRecord(schema,doc),{location_id:'HONBU',状態:'有効'});
 assert.equal(verifyFirestoreDocuments(schema,[{id:'HONBU',fields:{location_id:'WRONG',status:'有効'}}]).ok,false);
});
test('dry-run reports only missing keys and conflicts',async()=>{
 let writes=0;
 const core={readByIds:async()=>[{status:'有効'},{location_id:'TENROKU'},null],updateByKey:async()=>{writes++}};
 const result=await repair({table:'Dojo',ids:['HONBU','TENROKU','OTHER'],schema,core});
 assert.deepEqual(result.plan.map(x=>x.action),['backfill','already_ok','missing_document']);assert.equal(writes,0);
});
test('repair patches only primary key and verifies read-back',async()=>{
 const row={status:'有効'};const core={readByIds:async()=>[row],updateByKey:async(_s,id,fields)=>{assert.equal(id,'HONBU');assert.deepEqual(fields,{location_id:'HONBU'});Object.assign(row,fields);return {found:true}},readById:async()=>row};
 const result=await repair({table:'Dojo',ids:['HONBU'],schema,core,execute:true,confirm:'dojo-management-dev'});
 assert.equal(result.writes,1);assert.equal(row.status,'有効');
});
test('conflicting embedded key blocks all writes',async()=>{
 let writes=0;const core={readByIds:async()=>[{location_id:'WRONG'}],updateByKey:async()=>{writes++}};
 const result=await repair({table:'Dojo',ids:['HONBU'],schema,core,execute:true,confirm:'dojo-management-dev'});
 assert.equal(result.ok,false);assert.equal(writes,0);
});
