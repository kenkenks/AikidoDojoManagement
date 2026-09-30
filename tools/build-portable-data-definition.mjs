import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(root, 'schema', 'Setting.yml');
const outputPath = resolve(root, 'shared', 'DAO_Definition_Setting.generated.js');

function scalar(text) {
  const value = text.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

// PDD001 intentionally supports only the small YAML subset used by schema/Setting.yml.
// Keep parsing isolated here so a full YAML parser can replace it without changing Definition consumers.
function parseSettingDefinition(source) {
  const result = { fields: [], sources: {} };
  let section = '';
  let currentField = null;
  let currentSource = null;

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const text = line.trim();

    if (indent === 0) {
      const [key, ...rest] = text.split(':');
      if (rest.join(':').trim()) result[key] = scalar(rest.join(':'));
      else section = key;
      currentField = null;
      currentSource = null;
      continue;
    }

    if (section === 'fields') {
      if (indent === 2 && text.startsWith('- ')) {
        currentField = {};
        result.fields.push(currentField);
        const [key, ...rest] = text.slice(2).split(':');
        currentField[key] = scalar(rest.join(':'));
      } else if (indent === 4 && currentField) {
        const [key, ...rest] = text.split(':');
        currentField[key] = scalar(rest.join(':'));
      } else throw new Error(`Unsupported fields YAML: ${raw}`);
      continue;
    }

    if (section === 'sources') {
      if (indent === 2 && text.endsWith(':')) {
        currentSource = text.slice(0, -1);
        result.sources[currentSource] = {};
      } else if (indent === 4 && currentSource) {
        const [key, ...rest] = text.split(':');
        result.sources[currentSource][key] = scalar(rest.join(':'));
      } else throw new Error(`Unsupported sources YAML: ${raw}`);
      continue;
    }

    throw new Error(`Unsupported YAML: ${raw}`);
  }
  return result;
}

function validate(definition) {
  if (definition.entity !== 'setting') throw new Error('PDD001 expects entity: setting');
  if (!definition.version) throw new Error('Definition version is required');
  if (!Array.isArray(definition.fields) || !definition.fields.length) throw new Error('Definition fields are required');
  const names = new Set();
  let primaryKey = null;
  for (const field of definition.fields) {
    if (!field.name || names.has(field.name)) throw new Error('Field name must be unique');
    names.add(field.name);
    if (field.type !== 'string') throw new Error(`PDD001 supports string only: ${field.name}`);
    if (field.primary_key === true) {
      if (primaryKey) throw new Error('PDD001 supports one primary key');
      primaryKey = field.name;
    }
  }
  if (!primaryKey) throw new Error('Primary key is required');
  if (!definition.sources?.gas?.sheet) throw new Error('GAS sheet mapping is required');
  if (!definition.sources?.firestore?.collection) throw new Error('Firestore collection mapping is required');
  return primaryKey;
}

function transform(definition) {
  const keyField = validate(definition);
  const fields = Object.fromEntries(definition.fields.map(({name}) => [name, name]));
  const writable = definition.fields.map(({name}) => name);
  return {
    writable,
    sources: {
      firestore: { collection: definition.sources.firestore.collection, keyField, fields },
      gas: {
        sheet: definition.sources.gas.sheet,
        keyColumn: definition.fields.findIndex(({name}) => name === keyField) + 1,
        valueColumn: definition.fields.findIndex(({name}) => name === 'value') + 1,
        keyField,
        fields
      }
    }
  };
}

const definition = parseSettingDefinition(readFileSync(schemaPath, 'utf8'));
const transformed = transform(definition);
const output = `'use strict';\n// Generated from schema/Setting.yml by tools/build-portable-data-definition.mjs. Do not edit.\nconst settingDefinition = ${JSON.stringify(transformed, null, 2)};\nmodule.exports = { settingDefinition };\n`;
writeFileSync(outputPath, output, 'utf8');
console.log('Generated shared/DAO_Definition_Setting.generated.js from schema/Setting.yml');
