import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPortableDataDefinition } from './portable-data-definition-builder.mjs';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {parsePortableDefinition, transformPortableDefinition} from './portable-data-definition-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

buildPortableDataDefinition({
  schemaPath: resolve(root, 'schema', 'Setting.yml'),
  definitionOutputPath: resolve(root, 'shared', 'DAO_Definition_Setting.generated.js'),
  gasCreateOutputPath: resolve(root, 'gas', 'DojoPddCreateSetting.generated.js'),
  schemaLabel: 'schema/Setting.yml',
  exportName: 'settingDefinition',
  gasName: 'Setting'
});

console.log('Generated shared/DAO_Definition_Setting.generated.js from schema/Setting.yml');
console.log('Generated gas/DojoPddCreateSetting.generated.js from schema/Setting.yml');

const require = createRequire(import.meta.url);
const {applyNames, loadGlossary} = require('../work/copy-field-names.cjs');
const {renderFirestoreSchema} = require('../shared/Schema_Renderer_Firestore.js');
const glossary = loadGlossary();
const masters = Object.fromEntries(['Dojo','BillingBlock','TrainingSlot','Teacher','Fee',
  'PlanSelectionRule','Rank','ExaminationStandard'].map(table => {
  const definition = parsePortableDefinition(readFileSync(resolve(root,'schema',table+'.yml'),'utf8'));
  return [table,renderFirestoreSchema(transformPortableDefinition(applyNames(definition,glossary,table)))];
}));
writeFileSync(resolve(root,'shared','Attendance_Master_Schemas.generated.json'),JSON.stringify(masters,null,2)+'\n','utf8');
console.log('Generated shared/Attendance_Master_Schemas.generated.json from existing master schemas and glossary');
