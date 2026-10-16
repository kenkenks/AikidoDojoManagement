'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {definitions,tableDefinitions}=require('../shared/DAO_Definitions.js');

const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const json=relative=>JSON.parse(read(relative));
const audit=['request_id','authenticated_uid','receptionist_type','receptionist_id','recorded_at'];

test('cash request is a Firestore-only formal Entity matching the DAO contract',async()=>{
  const {parsePortableDefinition,transformPortableDefinition}=await import('../tools/portable-data-definition-core.mjs');
  const transformed=transformPortableDefinition(parsePortableDefinition(read('schema/PaymentCashRequest.yml')));
  assert.equal(transformed.sources.firestore.collection,'payment_cash_requests');
  assert.equal(transformed.sources.firestore.keyField,'request_id');
  assert.equal(Object.hasOwn(transformed.sources,'gas'),false);
  assert.deepEqual(Object.keys(transformed.sources.firestore.fields),
    ['request_id','input_hash','status','authenticated_uid','receptionist_type','receptionist_id','business_datetime','recorded_at','result']);
  assert.deepEqual(definitions.paymentCashRequest.sources.firestore,transformed.sources.firestore);
});

test('payment and evidence Firestore mappings include audit links without changing GAS mappings',()=>{
  const payment=definitions.paymentLog.sources,evidence=definitions.paymentEvidence.sources;
  for(const field of audit)assert.equal(payment.firestore.fields[field],field);
  for(const field of [...audit,'billing_group_id','location_id','billing_block_id','teacher_id','reception_session_id'])
    assert.equal(evidence.firestore.fields[field],field);
  for(const field of audit){
    assert.equal(Object.hasOwn(payment.gas.fields,field),false);
    assert.equal(Object.hasOwn(evidence.gas.fields,field),false);
  }
  assert.equal(Object.hasOwn(definitions.paymentCashRequest.sources,'gas'),false);
});

test('payment schemas generate the checked-in DAO source mappings exactly',async()=>{
  const {parsePortableDefinition,transformPortableDefinition}=await import('../tools/portable-data-definition-core.mjs');
  for(const [file,key] of [['PaymentLog.yml','paymentLog'],['PaymentEvidence.yml','paymentEvidence']]){
    const generated=transformPortableDefinition(parsePortableDefinition(read('schema/'+file)));
    assert.equal(generated.sources.firestore.collection,definitions[key].sources.firestore.collection);
    assert.deepEqual(generated.sources.firestore.fields,definitions[key].sources.firestore.fields);
    assert.equal(generated.sources.gas.sheet,definitions[key].sources.gas.sheet);
    assert.deepEqual(generated.sources.gas.fields,definitions[key].sources.gas.fields);
  }
});

test('master DAO physical collections agree with formal generated schema names',()=>{
  const generated=json('shared/Attendance_Master_Schemas.generated.json');
  for(const [logical,schemaName] of [['locations','Dojo'],['billingBlocks','BillingBlock'],['trainingSlots','TrainingSlot']]){
    assert.equal(definitions[logical].sources.firestore.collection,generated[schemaName].collection);
    assert.equal(tableDefinitions[logical].collection,generated[schemaName].collection);
  }
  assert.deepEqual([tableDefinitions.locations.collection,tableDefinitions.billingBlocks.collection,tableDefinitions.trainingSlots.collection],
    ['dojos','billing_blocks','training_slots']);
});

test('formal indexes cover every compound Command query and emulator reuses them',()=>{
  const indexes=json('firestore.indexes.json');
  const signature=index=>index.collectionGroup+':'+index.fields.map(field=>field.fieldPath).join(',');
  assert.deepEqual(indexes.indexes.map(signature).sort(),[
    'invoices:billing_group_id,target_month','payments:billing_group_id,target_month']);
  const emulator=json('work/firebase-emulator-fw002.json');
  assert.equal(emulator.firestore.indexes,'../firestore.indexes.json');
  assert.equal(emulator.firestore.rules,'firestore-emulator-deny-all.rules');
  assert.equal(emulator.emulators.firestore.host,'127.0.0.1');
  assert.equal(emulator.emulators.ui.enabled,false);
});

test('DEV target deployment remains Hosting-only and cannot implicitly deploy indexes',()=>{
  const target=read('tools/target.mjs');
  assert.match(target,/Firebase Hosting only \(Cloud Run unchanged\)/);
  assert.match(target,/\["deploy", "--only", "hosting"/);
  assert.doesNotMatch(target,/firestore:indexes/);
});
