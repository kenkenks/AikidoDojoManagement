'use strict';
// Existing-document primary-key backfill. Dry-run by default; never overwrites other fields.
const { createFirestoreCore } = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const { tableSchema } = require('./gas2firebase-copy.cjs');
const PROFILE = require('../targets/dev-firebase.json');
const { assertDevFirebaseTarget } = require('./apply-member-gas-to-firestore-real.cjs');
const ALLOWED = new Set(['Member','Dojo','Teacher','Fee','PlanSelectionRule','TrainingSlot','BillingBlock','Rank','ExaminationStandard']);
async function repair({ table, ids, execute = false, confirm, core, schema } = {}) {
  if (!ALLOWED.has(table)) throw Error('REPAIR_TABLE_UNSUPPORTED');
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(id)) || new Set(ids).size !== ids.length) throw Error('REPAIR_IDS_INVALID');
  if (execute && confirm !== 'dojo-management-dev') throw Error('REPAIR_CONFIRMATION_REQUIRED');
  assertDevFirebaseTarget(PROFILE);
  schema ||= await tableSchema(table);
  const key = schema.fields.find(field => field.documentId);
  if (!key || key.type !== 'string') throw Error('REPAIR_SCHEMA_KEY_INVALID');
  core ||= createFirestoreCore(PROFILE, {getAccessToken: async () => process.env.FIRESTORE_DEV_ACCESS_TOKEN || ''});
  const source = {collection: schema.collection};
  const existing = await core.readByIds(source, ids);
  if (!Array.isArray(existing) || existing.length !== ids.length || existing.some(v => v === undefined)) throw Error('REPAIR_READ_INCOMPLETE');
  const plan = ids.map((id, index) => {
    const row = existing[index];
    if (row === null) return {id, action:'missing_document'};
    if (Object.hasOwn(row,key.physicalName)) return {id, action:row[key.physicalName] === id ? 'already_ok' : 'conflict'};
    return {id, action:'backfill'};
  });
  const result = {ok: !plan.some(x => x.action === 'conflict'), mode:execute?'execute':'dry-run', collection:schema.collection, key_field:key.physicalName, plan, writes:0};
  if (!result.ok || !execute) return result;
  for (const item of plan) {
    if (item.action !== 'backfill') continue;
    const response = await core.updateByKey(source,item.id,{[key.physicalName]:item.id});
    if (response?.found === false) throw Error(`REPAIR_DOCUMENT_DISAPPEARED:${item.id}`);
    result.writes++;
    const after = await core.readById(source,item.id);
    if (after?.[key.physicalName] !== item.id) throw Error(`REPAIR_VERIFY_FAILED:${item.id}`);
  }
  return result;
}
if (require.main === module) {
  const args=process.argv.slice(2), value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1]};
  repair({table:value('--table'),ids:(value('--ids')||'').split(',').filter(Boolean),execute:args.includes('--execute'),confirm:value('--confirm')})
    .then(result=>{console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=2})
    .catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1});
}
module.exports={repair};
