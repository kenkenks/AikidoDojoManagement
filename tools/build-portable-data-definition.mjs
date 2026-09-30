import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPortableDataDefinition } from './portable-data-definition-builder.mjs';

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
