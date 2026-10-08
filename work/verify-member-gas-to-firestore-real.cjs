'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { apply, assertDevFirebaseTarget, assertCoreWritableFields } = require('./apply-member-gas-to-firestore-real.cjs');

const profile = { target:'dev-firebase', mode:'development', projectId:'dojo-management-dev', confirmedDevelopmentProject:'dojo-management-dev' };
const schema = {
  collection:'members', documentIdField:'member_id', fields:[
    { logicalName:'member_id', physicalName:'member_id', type:'string', required:true, documentId:true },
    { logicalName:'member_name', physicalName:'member_name', type:'string', required:false, documentId:false },
    { logicalName:'status', physicalName:'status', type:'string', required:false, documentId:false }
  ]
};
function built() {
  return { schema, documents:[{ id:'M_TEST', fields:{ member_name:'Test', status:'active' } }], verification:{ok:true,errors:[]} };
}

test('real bridge appends absent document then reads back and verifies', async () => {
  const calls=[]; let stored=null;
  const core={
    async readById(){ calls.push('read'); return stored && {...stored}; },
    async append(_s,_id,fields){ calls.push('append'); stored={...fields}; },
    async replaceByKey(){ throw new Error('unexpected replace'); }
  };
  const result=await apply({profile,core,built:built(),confirmDocumentId:'M_TEST',allowReplace:true});
  assert.equal(result.ok,true); assert.equal(result.write_mode,'append'); assert.equal(result.read_back,true); assert.equal(result.writes,1);
  assert.deepEqual(calls,['read','append','read']);
});

test('real bridge replaces existing document so stale fields cannot survive', async () => {
  const calls=[]; let stored={legacy:'stale'};
  const core={
    async readById(){ calls.push('read'); return stored && {...stored}; },
    async append(){ throw new Error('unexpected append'); },
    async replaceByKey(_s,_id,fields){ calls.push('replace'); stored={...fields}; }
  };
  const result=await apply({profile,core,built:built(),confirmDocumentId:'M_TEST',allowReplace:true});
  assert.equal(result.write_mode,'replace'); assert.deepEqual(stored,{member_name:'Test',status:'active'});
  assert.deepEqual(calls,['read','replace','read']);
});

test('real bridge rejects non-dev target and unsupported numeric core write', () => {
  assert.throws(() => assertDevFirebaseTarget({...profile,projectId:'wrong'}), /DEV_TARGET_REQUIRED/);
  assert.throws(() => assertCoreWritableFields({fields:{count:1}}), /CORE_STRING_ONLY/);
});

test('existing document is not replaced without explicit approval', async () => {
  let writes=0;
  const core={async readById(){return {legacy:'value'};},async append(){writes++;},async replaceByKey(){writes++;}};
  await assert.rejects(apply({profile,core,built:built(),confirmDocumentId:'M_TEST'}), /REPLACE_BLOCKED/);
  assert.equal(writes,0);
});

test('document ID confirmation is required before any remote read or write', async () => {
  let calls=0;
  const core={async readById(){calls++;},async append(){calls++;},async replaceByKey(){calls++;}};
  await assert.rejects(apply({profile,core,built:built()}), /CONFIRM_DOCUMENT_ID_REQUIRED/);
  assert.equal(calls,0);
});

test('real module imports a callable renderer builder', () => {
  assert.equal(typeof require('./dry-run-member-gas-to-firestore.cjs').buildRenderedMember, 'function');
});
