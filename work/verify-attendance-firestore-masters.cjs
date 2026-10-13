'use strict';
// Read-only Firestore attendance-master inspection. Never writes.
const {createFirestoreCore} = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const {tableSchema} = require('./gas2firebase-copy.cjs');
const {restoreFirestoreRecord} = require('../shared/Schema_Renderer_Firestore.js');
const {assertDevFirebaseTarget} = require('./apply-member-gas-to-firestore-real.cjs');
const PROFILE = require('../targets/dev-firebase.json');

async function inspect({locationId, core, limit = 100} = {}) {
  if (typeof locationId !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(locationId)) throw Error('LOCATION_ID_INVALID');
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw Error('LIMIT_INVALID');
  assertDevFirebaseTarget(PROFILE);
  core ||= createFirestoreCore(PROFILE, {getAccessToken:async()=>process.env.FIRESTORE_DEV_ACCESS_TOKEN || ''});
  const report = {ok:true,mode:'read-only',location_id:locationId,collections:{},issues:[]};
  const dojoSchema = await tableSchema('Dojo');
  const dojo = await core.readById({collection:dojoSchema.collection},locationId);
  function check(table, schema, id, fields) {
    const key = schema.fields.find(f=>f.documentId);
    if (!key || !Object.hasOwn(fields,key.physicalName)) {
      report.issues.push({table,id,issue:'missing_embedded_primary_key'}); return null;
    }
    if (fields[key.physicalName] !== id) {
      report.issues.push({table,id,issue:'primary_key_mismatch'}); return null;
    }
    try {return restoreFirestoreRecord(schema,{id,fields});}
    catch(e) {report.issues.push({table,id,issue:e.message});return null;}
  }
  report.collections.dojos={count:dojo?1:0};
  if (!dojo) report.issues.push({table:'Dojo',id:locationId,issue:'missing_document'});
  else check('Dojo',dojoSchema,locationId,dojo);
  const logical={};
  for (const table of ['BillingBlock','TrainingSlot']) {
    const schema=await tableSchema(table);
    const key=schema.fields.find(f=>f.documentId);
    const rows=await core.queryEqual({collection:schema.collection},[{field:'location_id',value:locationId}],{limit,includeDocumentId:true});
    if (!Array.isArray(rows)) throw Error('QUERY_RESPONSE_INVALID');
    const ids=new Set();
    logical[table]=[];
    for (const row of rows) {
      const id=row?.id;
      if (typeof id!=='string' || !/^[A-Za-z0-9_-]{1,150}$/.test(id)) {
        report.issues.push({table,issue:'invalid_document_id'});continue;
      }
      if (ids.has(id)) report.issues.push({table,id,issue:'duplicate_document_id'});
      ids.add(id);
      if (!row.fields || typeof row.fields!=='object') {
        report.issues.push({table,id,issue:'invalid_document_fields'});continue;
      }
      const dto=check(table,schema,id,row.fields);
      if (dto) logical[table].push(dto);
    }
    report.collections[schema.collection]={count:rows.length,verified:logical[table].length,at_limit:rows.length===limit};
    if (rows.length===limit) report.issues.push({table,issue:'query_limit_reached_results_may_be_incomplete'});
  }
  const blocks=new Set(logical.BillingBlock.map(row=>row.billing_block_id));
  for (const slot of logical.TrainingSlot) if (!blocks.has(slot.billing_block_id))
    report.issues.push({table:'TrainingSlot',id:slot.slot_id,issue:'billing_block_not_found_in_scope',billing_block_id:slot.billing_block_id});
  report.ok=report.issues.length===0;
  return report;
}
if(require.main===module) {
  const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1]};
  inspect({locationId:value('--location-id'),limit:value('--limit')?Number(value('--limit')):100})
    .then(r=>{console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=2})
    .catch(e=>{console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1});
}
module.exports={inspect};
