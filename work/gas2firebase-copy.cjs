'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { renderFirestoreSchema, renderFirestoreDocuments, verifyFirestoreDocuments } = require('../shared/Schema_Renderer_Firestore.js');
const { bridgeGasOptionalEmptyNumbers } = require('./dry-run-member-gas-to-firestore.cjs');
const { assertDevFirebaseTarget, assertCoreWritableFields } = require('./apply-member-gas-to-firestore-real.cjs');
const { createFirestoreCore } = require('../cloud/member-read/DAO_Core_Firestore.cjs');
const { prepareRecords } = require('./copy-boolean-normalizer.cjs');
const { applyNames, loadGlossary } = require('./copy-field-names.cjs');

const ROOT = path.resolve(__dirname, '..');
const PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'targets', 'dev-firebase.json'), 'utf8'));
const GAS_BUILD = path.join(ROOT, '.build', 'dev-gas', 'gas');
const COMMANDS = Object.freeze({ Member: 'runner_gas2firebase_copy_member_source', Setting: 'runner_gas2firebase_copy_setting_source', Dojo: 'runner_gas2firebase_copy_dojo_source', Teacher: 'runner_gas2firebase_copy_teacher_source' });
const progress = message => process.stderr.write(`[GAS2FirebaseCopy] ${message}\n`);
function differences(expected, actual) {
  const result = [];
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return [{ field: '(document)', expectedType: 'object', actualType: typeof actual }];
  for (const field of new Set([...Object.keys(expected), ...Object.keys(actual)]).values()) {
    const a = expected[field], b = actual[field];
    if (!Object.is(a, b)) result.push({ field, expected: a === undefined ? '(absent)' : a, actual: b === undefined ? '(absent)' : b });
  }
  return result;
}

function readGasRecords(table, options = {}) {
  if (table === 'Setting' && (!Array.isArray(options.keys) || !options.keys.length)) throw new Error('COPY_SETTING_KEYS_REQUIRED');
  const command = COMMANDS[table];
  if (!command) throw new Error('COPY_TABLE_UNSUPPORTED');
  if (!fs.existsSync(path.join(GAS_BUILD, '.clasp.json'))) throw new Error('DEV_GAS_BUILD_REQUIRED: npm run target:build -- dev-gas');
  if (!fs.existsSync(path.join(GAS_BUILD, '31_GAS2FirebaseCopySource.js')))
    throw new Error('COPY_GAS_BUILD_STALE: npm run target:build -- dev-gas, then npm run target:push -- dev-gas');
  progress(`GAS source: invoking ${command} (clasp run; may take time)...`);
  const args = ['run', command, '--user', 'dojo-dev', '--json'];
  if (table === 'Setting') args.push('--params', JSON.stringify([{ keys: options.keys }]));
  const result = process.platform === 'win32'
    ? spawnSync('clasp.cmd', args, { cwd: GAS_BUILD, encoding: 'utf8', shell: true, windowsHide: true })
    : spawnSync('clasp', args, { cwd: GAS_BUILD, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`COPY_CLASP_RUN_FAILED: ${result.error?.message || result.stderr?.trim() || result.stdout?.trim() || result.status}`);
  let payload;
  try { payload = JSON.parse(result.stdout); } catch (_) { throw new Error(`COPY_CLASP_JSON_INVALID: ${(result.stdout || '').slice(0, 400)}`); }
  if (payload?.error) {
    const error = payload.error;
    if (error.message?.includes('Script function not found'))
      throw new Error(`COPY_GAS_FUNCTION_NOT_DEPLOYED: ${command}; run npm run target:build -- dev-gas then npm run target:push -- dev-gas`);
    throw new Error(`COPY_GAS_API_ERROR: ${error.message || JSON.stringify(error)}`);
  }
  const response = payload?.response;
  if (response?.ok !== true || !Array.isArray(response.records))
    throw new Error(`COPY_GAS_SOURCE_INVALID: ${response?.error || JSON.stringify(response ?? payload).slice(0, 400)}`);
  progress(`GAS records fetched: ${response.records.length}`);
  return response.records;
}

async function tableSchema(table) {
  const { parsePortableDefinition, transformPortableDefinition } = await import('../tools/portable-data-definition-core.mjs');
  const schemaPath = path.join(ROOT, 'schema', `${table}.yml`);
  const yaml = fs.readFileSync(schemaPath, 'utf8');
  const definition = parsePortableDefinition(yaml);
  const mapped = ['Dojo', 'Teacher'].includes(table) ? applyNames(definition, loadGlossary(), table) : definition;
  const schema = renderFirestoreSchema(transformPortableDefinition(mapped));
  if (['Dojo', 'Teacher'].includes(table)) {
    progress(`Schema: ${schemaPath}`);
    progress(`Schema fields: ${JSON.stringify(schema.fields.map(field => `${field.logicalName} -> ${field.physicalName}`))}`);
  }
  return schema;
}

async function copy(options = {}) {
  const { source = 'gas', destination = 'firestore', table = 'Member', execute = false, preflight = false, verifyExisting = false, limit } = options;
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('COPY_LIMIT_INVALID');
  if (limit !== undefined && !execute) throw new Error('COPY_LIMIT_REQUIRES_EXECUTE');
  if ([execute, preflight, verifyExisting].filter(Boolean).length > 1) throw new Error('COPY_MODE_CONFLICT');
  if (source !== 'gas' || destination !== 'firestore') throw new Error('COPY_DIRECTION_UNSUPPORTED');
  if (!Object.hasOwn(COMMANDS, table)) throw new Error('COPY_TABLE_UNSUPPORTED');
  if (table === 'Setting' && (!Array.isArray(options.keys) || !options.keys.length)) throw new Error('COPY_SETTING_KEYS_REQUIRED');
  if (options.progress) options.progress('START', { source, destination, table, execute });
  const profile = options.profile || PROFILE;
  assertDevFirebaseTarget(profile);
  const schema = options.schema || await tableSchema(table);
  const records = options.records === undefined ? readGasRecords(table, options) : options.records;
  if (options.progress) options.progress('FETCHED', { count: records.length });
  if (!Array.isArray(records)) throw new Error('COPY_RECORDS_INVALID');
  // For new masters, never silently discard unmodelled GAS columns.
  if (['Dojo', 'Teacher'].includes(table)) {
    const known = new Set(schema.fields.map(field => field.logicalName));
    const unexpected = [...new Set(records.flatMap(row => Object.keys(row).filter(key => !known.has(key))))];
    if (unexpected.length) throw new Error(`COPY_SOURCE_FIELDS_UNMAPPED:${table}:${JSON.stringify(unexpected)}`);
  }
  // Normalization is opt-in per field in the portable schema; no global coercion.
  let normalizedRecords = records;
  let normalization = {};
  if (table === 'Teacher') {
    const yaml = fs.readFileSync(path.join(ROOT, 'schema', 'Teacher.yml'), 'utf8');
    const { parsePortableDefinition } = await import('../tools/portable-data-definition-core.mjs');
    const definition = parsePortableDefinition(yaml);
    const fields = definition.fields.filter(f => f.normalize === 'boolean').map(f => f.name);
    for (const field of fields) {
      if (!schema.fields.some(f => f.logicalName === field && f.type === 'boolean')) throw new Error(`COPY_NORMALIZE_SCHEMA_INVALID:${field}`);
    }
    const result = prepareRecords(records, fields);
    normalizedRecords = result.records;
    normalization = result.stats;
    progress(`Normalization counts: ${JSON.stringify(normalization)}`);
  }
  const documents = renderFirestoreDocuments(schema, normalizedRecords.map(row => bridgeGasOptionalEmptyNumbers(row, schema)));
  const verification = verifyFirestoreDocuments(schema, documents);
  if (!verification.ok) throw new Error(`COPY_SCHEMA_VERIFICATION_FAILED:${verification.errors[0]?.error}`);
  const ids = new Set();
  for (const doc of documents) {
    if (ids.has(doc.id)) throw new Error('COPY_DUPLICATE_DOCUMENT_ID');
    ids.add(doc.id);
    assertCoreWritableFields(doc);
  }
  const summary = { ok: true, mode: execute ? 'execute' : verifyExisting ? 'verify-existing' : preflight ? 'preflight' : 'dry-run', source, destination, table, collection: schema.collection,
    total: documents.length, created: 0, skipped: 0, errors: 0, writes: 0, normalization };
  if (options.progress) options.progress('VALIDATED', { count: documents.length });
  if (!execute && !preflight && !verifyExisting) { if (options.progress) options.progress('COMPLETE', summary); return summary; }
  if (execute && options.confirm !== 'dojo-management-dev') throw new Error('COPY_EXECUTE_CONFIRMATION_REQUIRED');
  // Authentication is resolved only for a real write. Tests may inject an existing DAO core.
  const core = options.core || createFirestoreCore(profile, { getAccessToken: async () => {
    const token = process.env.FIRESTORE_DEV_ACCESS_TOKEN;
    if (!token?.trim()) throw new Error('FIRESTORE_DEV_ACCESS_TOKEN_REQUIRED');
    return token.trim();
  } });
  const target = { collection: schema.collection };
  // Read-only preflight: determine every existing ID before the first write.
  // The same preflight is mandatory for execute; append uses Firestore exists=false
  // so concurrent creations cannot be overwritten.
  if (options.progress) options.progress('PREFLIGHT', { count: documents.length });
  const existing = typeof core.readByIds === 'function'
    ? await core.readByIds(target, documents.map(doc => doc.id))
    : await Promise.all(documents.map(doc => core.readById(target, doc.id)));
  if (!Array.isArray(existing) || existing.length !== documents.length ||
      existing.some(value => value === undefined)) throw new Error('COPY_PREFLIGHT_INCOMPLETE');
  const plannedCreate = existing.filter(value => value === null).length;
  const plannedSkip = existing.length - plannedCreate;
  summary.planned_create = plannedCreate;
  summary.planned_skip = plannedSkip;
  if (options.progress) options.progress('PREFLIGHT_DONE', { plannedCreate, plannedSkip });
  if (verifyExisting) {
    summary.verified = 0;
    summary.mismatched = 0;
    summary.differences = [];
    for (let index = 0; index < documents.length; index++) {
      if (existing[index] === null) continue;
      const diff = differences(documents[index].fields, existing[index]);
      if (diff.length) {
        summary.mismatched++;
        summary.differences.push({ id: documents[index].id, fields: diff.slice(0, 20) });
      } else summary.verified++;
    }
    summary.ok = summary.mismatched === 0;
    if (options.progress) options.progress('COMPLETE', summary);
    return summary;
  }
  if (preflight) { if (options.progress) options.progress('COMPLETE', summary); return summary; }
  summary.limit = limit ?? null;
  summary.verified = 0;
  for (let index = 0; index < documents.length; index++) {
    const doc = documents[index];
    if (limit !== undefined && summary.created >= limit) break;
    try {
      if (existing[index] !== null) { summary.skipped++; if (options.progress) options.progress('ITEM', { processed: summary.created + summary.skipped, total: summary.total, created: summary.created, skipped: summary.skipped }); continue; }
      await core.append(target, doc.id, doc.fields);
      summary.writes++; // count confirmed append before read-back verification
      const after = await core.readById(target, doc.id);
      const diff = differences(doc.fields, after);
      if (diff.length) {
        summary.mismatch = { id: doc.id, fields: diff.slice(0, 20) };
        throw new Error('COPY_READ_BACK_MISMATCH');
      }
      summary.created++;
      summary.verified++;
      if (options.progress) options.progress('ITEM', { processed: summary.created + summary.skipped, total: summary.total, created: summary.created, skipped: summary.skipped });
    } catch (error) {
      summary.ok = false;
      summary.errors++;
      summary.first_error ||= error.message;
      break; // stop on first error; previously completed writes are not rolled back
    }
  }
  if (options.progress) options.progress('COMPLETE', summary);
  return summary;
}

function parseArgs(args) {
  if (args.includes('--help')) return { help: true };
  const value = flag => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
  return { source: value('--source') || 'gas', destination: value('--destination') || 'firestore',
    table: value('--table') || 'Member', execute: args.includes('--execute'), preflight: args.includes('--preflight'), verifyExisting: args.includes('--verify-existing'), confirm: value('--confirm'),
    limit: args.includes('--limit') ? Number(value('--limit')) : undefined, keys: value('--keys') ? value('--keys').split(',').map(x => x.trim()).filter(Boolean) : undefined };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) process.stdout.write('Usage: node work/gas2firebase-copy.cjs --table Member|Setting|Dojo|Teacher [--keys KEY1,KEY2 (required for Setting)] --source gas --destination firestore [--preflight | --verify-existing | --execute --confirm dojo-management-dev [--limit 1]]\nDefault: dry-run (zero writes); --preflight checks IDs; --verify-existing compares existing documents (zero writes).\n');
  else copy({ ...args, progress: (stage, data) => {
    if (stage === 'START') progress(`START ${data.table} ${data.source} -> ${data.destination} ${data.execute ? 'EXECUTE' : args.preflight ? 'PREFLIGHT' : args.verifyExisting ? 'VERIFY-EXISTING' : 'DRY-RUN'}`);
    else if (stage === 'FETCHED') progress(`Fetched ${data.count} records`);
    else if (stage === 'VALIDATED') progress(`Schema validated: ${data.count} records`);
    else if (stage === 'PREFLIGHT') progress(`Firestore preflight: checking ${data.count} IDs (read-only)...`);
    else if (stage === 'PREFLIGHT_DONE') progress(`Firestore preflight: create=${data.plannedCreate}, skip=${data.plannedSkip}`);
    else if (stage === 'ITEM') progress(`Written/checked ${data.processed}/${data.total} (created=${data.created}, skipped=${data.skipped})`);
    else if (stage === 'COMPLETE') progress(`COMPLETE: ${data.mode}, total=${data.total}, writes=${data.writes}, errors=${data.errors}`);
  } }).then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  }).catch(error => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, writes: 0 })}\n`);
    process.exitCode = 1;
  });
}
module.exports = { copy, parseArgs, readGasRecords };
