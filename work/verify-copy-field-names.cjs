'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { applyNames, loadGlossary } = require('./copy-field-names.cjs');
const { copy } = require('./gas2firebase-copy.cjs');
const ROOT = path.resolve(__dirname, '..');
async function schema(table) {
  const { parsePortableDefinition, transformPortableDefinition } = await import('../tools/portable-data-definition-core.mjs');
  const { renderFirestoreSchema } = require('../shared/Schema_Renderer_Firestore.js');
  return renderFirestoreSchema(transformPortableDefinition(applyNames(parsePortableDefinition(fs.readFileSync(path.join(ROOT, 'schema', `${table}.yml`), 'utf8')), loadGlossary(), table)));
}
test('Dojo mappings are ASCII and unique', async () => {
  const s = await schema('Dojo');
  assert.deepEqual(s.fields.map(x => x.physicalName), ['location_id','display_name','dojo_name','status','notes']);
});
test('Teacher mappings are ASCII and unique', async () => {
  const s = await schema('Teacher');
  assert.equal(s.fields.find(x => x.logicalName === '会費回収可').physicalName, 'can_collect_membership_fee');
});
test('unmapped fields fail closed', () => {
  assert.throws(() => applyNames({ fields:[{name:'新項目'}] }, {common:{},tables:{}}, 'Dojo'), /COPY_FIELD_NAMES_UNRESOLVED/);
});
test('duplicate physical names fail closed', () => {
  assert.throws(() => applyNames({ fields:[{name:'状態'}, {name:'備考'}] }, {common:{'状態':'status','備考':'status'}}, 'Dojo'), /COPY_FIELD_NAME_COLLISION/);
});
test('Dojo dry-run renders English physical fields and keeps Japanese source values', async () => {
  const s = await schema('Dojo');
  const record = { location_id:'D001', 表示名:'第一道場', 道場名:'本館', 状態:'有効', 備考:'確認済' };
  const result = await copy({ table:'Dojo', schema:s, records:[record] });
  assert.equal(result.ok,true); assert.equal(result.writes,0);
  const { renderFirestoreDocuments } = require('../shared/Schema_Renderer_Firestore.js');
  const doc = renderFirestoreDocuments(s,[record])[0];
  assert.deepEqual(doc.fields, {display_name:'第一道場', dojo_name:'本館', status:'有効', notes:'確認済'});
});
test('Teacher boolean normalization and English output work together', async () => {
  const s = await schema('Teacher');
  const row = {teacher_id:'T001', '出席受付可':true, '会費回収可':''};
  const result = await copy({table:'Teacher',schema:s,records:[row]});
  assert.equal(result.ok,true); assert.equal(result.normalization['会費回収可'].unset,1);
});
