'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const GLOSSARY = path.join(ROOT, 'schema', 'copy-field-glossary.json');
const VALID = /^[A-Za-z_][A-Za-z0-9_]*$/;
function loadGlossary() {
  return JSON.parse(fs.readFileSync(GLOSSARY, 'utf8'));
}
function resolveNames(definition, glossary, table) {
  const scoped = glossary.tables?.[table] || {};
  const common = glossary.common || {};
  const resolved = new Map();
  const used = new Set();
  const missing = [];
  for (const field of definition.fields) {
    const physical = field.firestore_name || scoped[field.name] || common[field.name] || (VALID.test(field.name) ? field.name : null);
    if (!physical) { missing.push(field.name); continue; }
    if (!VALID.test(physical)) throw Error(`COPY_FIELD_NAME_INVALID:${table}:${field.name}:${physical}`);
    if (used.has(physical)) throw Error(`COPY_FIELD_NAME_COLLISION:${table}:${physical}`);
    used.add(physical);
    resolved.set(field.name, physical);
  }
  if (missing.length) throw Error(`COPY_FIELD_NAMES_UNRESOLVED:${table}:${JSON.stringify(missing)}; run node work/copy-field-names.cjs --table ${table}`);
  return resolved;
}
function applyNames(definition, glossary, table) {
  const resolved = resolveNames(definition, glossary, table);
  return { ...definition, fields: definition.fields.map(field => ({ ...field, firestore_name: resolved.get(field.name) })) };
}
async function registerNames(table, { input = process.stdin, output = process.stdout } = {}) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(table)) throw Error('COPY_TABLE_INVALID');
  const schemaPath = path.join(ROOT, 'schema', `${table}.yml`);
  const { parsePortableDefinition } = await import('../tools/portable-data-definition-core.mjs');
  const definition = parsePortableDefinition(fs.readFileSync(schemaPath, 'utf8'));
  const glossary = loadGlossary();
  const scoped = { ...(glossary.tables?.[table] || {}) };
  const common = glossary.common || {};
  const unresolved = definition.fields.filter(f => !f.firestore_name && !scoped[f.name] && !common[f.name] && !VALID.test(f.name));
  if (!unresolved.length) { output.write(`No unresolved fields for ${table}.\n`); return 0; }
  if (!input.isTTY) throw Error(`COPY_FIELD_NAMES_INTERACTIVE_REQUIRED:${table}`);
  const readline = require('node:readline/promises');
  const rl = readline.createInterface({ input, output });
  try {
    for (const field of unresolved) {
      const name = (await rl.question(`${table} / ${field.name} -> Firestore field (snake_case): `)).trim();
      if (!VALID.test(name)) throw Error(`COPY_FIELD_NAME_INVALID:${table}:${field.name}:${name}`);
      scoped[field.name] = name;
    }
    const next = { ...glossary, tables: { ...(glossary.tables || {}), [table]: scoped } };
    resolveNames(definition, next, table); // check collisions and full coverage before saving
    fs.writeFileSync(GLOSSARY, JSON.stringify(next, null, 2) + '\n', 'utf8');
    output.write(`Saved ${unresolved.length} mapping(s) to ${GLOSSARY}\n`);
    return unresolved.length;
  } finally { rl.close(); }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const table = args[args.indexOf('--table') + 1];
  if (!args.includes('--table') || !table || table.startsWith('--')) { console.error('Usage: node work/copy-field-names.cjs --table Dojo|Teacher'); process.exitCode = 1; }
  else registerNames(table).catch(e => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { loadGlossary, resolveNames, applyNames, registerNames };
