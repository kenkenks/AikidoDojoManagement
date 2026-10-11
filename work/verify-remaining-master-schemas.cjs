'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { loadGlossary, resolveNames } = require('./copy-field-names.cjs');
(async () => {
  const { parsePortableDefinition } = await import('../tools/portable-data-definition-core.mjs');
  const inventory = JSON.parse(fs.readFileSync('work/master-inventory-result.json','utf8'));
  const map = {Fee:'03_料金マスタ',PlanSelectionRule:'03_料金プラン選択ルール',TrainingSlot:'12_稽古枠マスタ',BillingBlock:'13_課金枠マスタ',Rank:'14_級段位マスタ',ExaminationStandard:'15_審査基準マスタ'};
  for (const [table,sheet] of Object.entries(map)) {
    const def = parsePortableDefinition(fs.readFileSync(`schema/${table}.yml`,'utf8'));
    resolveNames(def,loadGlossary(),table);
    const actual = inventory.sheets.find(s => s.sheet === sheet);
    assert(actual && actual.ok);
    const declared = def.fields.map(f=>f.name).filter(f=>!f.startsWith('copy_'));
    assert.deepEqual(new Set(declared),new Set(actual.headers),table);
    console.log(`PASS ${table}: ${actual.count} rows, ${declared.length} fields`);
  }
})().catch(e=>{console.error(e);process.exitCode=1});
