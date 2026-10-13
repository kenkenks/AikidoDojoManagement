'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspect}=require('./verify-attendance-firestore-masters.cjs');
const {tableSchema}=require('./gas2firebase-copy.cjs');
const {renderFirestoreDocuments}=require('../shared/Schema_Renderer_Firestore.js');
async function fixture(table,values) {
  const schema=await tableSchema(table);
  const row=Object.fromEntries(schema.fields.map(f=>[f.logicalName,f.documentId?values.id:f.type==='boolean'?true:f.type==='number'?2:'有効']));
  Object.assign(row,values.fields);
  return renderFirestoreDocuments(schema,[row],{includeDocumentIdField:true})[0];
}
test('scoped real-data inspector verifies master keys, DTO and references without writes',async()=>{
  const docs=[await fixture('Dojo',{id:'HONBU',fields:{location_id:'HONBU'}}),
    await fixture('BillingBlock',{id:'B1',fields:{location_id:'HONBU'}}),
    await fixture('TrainingSlot',{id:'S1',fields:{location_id:'HONBU',billing_block_id:'B1'}})];
  const schemas=await Promise.all(['Dojo','BillingBlock','TrainingSlot'].map(tableSchema));
  const db=new Map(docs.map((d,i)=>[`${schemas[i].collection}/${d.id}`,d.fields]));
  const core={readById:async(s,id)=>db.get(`${s.collection}/${id}`)||null,
    queryEqual:async(s,filters)=>[...db.entries()].filter(([k,v])=>k.startsWith(`${s.collection}/`)&&v.location_id===filters[0].value).map(([k,v])=>({id:k.split('/')[1],fields:v}))};
  const result=await inspect({locationId:'HONBU',core});
  assert.equal(result.ok,true);assert.equal(result.collections.training_slots.verified,1);
  db.get('training_slots/S1').billing_block_id='NOT_FOUND';
  const bad=await inspect({locationId:'HONBU',core});
  assert.equal(bad.ok,false);assert.equal(bad.issues[0].issue,'billing_block_not_found_in_scope');
});

test('missing embedded key reports actual document ID without writing',async()=>{
  const dojo=await fixture('Dojo',{id:'HONBU',fields:{location_id:'HONBU'}});
  const block=await fixture('BillingBlock',{id:'B1',fields:{location_id:'HONBU'}});
  delete block.fields.billing_block_id;
  const schemas=await Promise.all(['Dojo','BillingBlock'].map(tableSchema));
  const db=new Map([[`${schemas[0].collection}/HONBU`,dojo.fields],[`${schemas[1].collection}/B1`,block.fields]]);
  const core={readById:async(s,id)=>db.get(`${s.collection}/${id}`)||null,
    queryEqual:async(s,filters)=>[...db.entries()].filter(([k,v])=>k.startsWith(`${s.collection}/`)&&v.location_id===filters[0].value).map(([k,v])=>({id:k.split('/')[1],fields:v}))};
  const result=await inspect({locationId:'HONBU',core});
  assert.equal(result.ok,false);
  assert.deepEqual(result.issues,[{table:'BillingBlock',id:'B1',issue:'missing_embedded_primary_key'}]);
});
