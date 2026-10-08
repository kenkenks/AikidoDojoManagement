'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  renderFirestoreSchema,
  renderFirestoreDocuments,
  verifyFirestoreDocuments
} = require('../shared/Schema_Renderer_Firestore.js');

const ROOT = path.resolve(__dirname, '..');
const GAS_BUILD = path.join(ROOT, '.build', 'dev-gas', 'gas');

function sanitizedError(error) {
  const message = error && error.message ? error.message : String(error);
  const match = message.match(/(?:TYPE_MISMATCH|REQUIRED_FIELD_MISSING|DOCUMENT_ID_REQUIRED)[^\s]*/);
  return match ? match[0] : message.split(/\r?\n/, 1)[0];
}

function readRealMemberViaClasp() {
  if (!fs.existsSync(path.join(GAS_BUILD, '.clasp.json'))) {
    throw new Error('DEV_GAS_BUILD_REQUIRED');
  }
  const args = [
    'run',
    'runner_member_firestore_dry_run_source',
    '--user', 'dojo-dev',
    '--json'
  ];
  const result = process.platform === 'win32'
    ? spawnSync('clasp run runner_member_firestore_dry_run_source --user dojo-dev --json', {
        cwd: GAS_BUILD,
        encoding: 'utf8',
        windowsHide: true,
        shell: true
      })
    : spawnSync('clasp', args, {
        cwd: GAS_BUILD,
        encoding: 'utf8',
        windowsHide: true
      });
  if (result.error) throw new Error(`CLASP_RUN_FAILED:${result.error.code || result.error.message}`);
  if (result.status !== 0) throw new Error(`CLASP_RUN_FAILED:${result.status}`);
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (_) {
    throw new Error('CLASP_JSON_INVALID');
  }
  const response = payload && payload.response;
  if (!response || response.ok !== true || !response.member) {
    throw new Error(response && response.error ? response.error : 'MEMBER_SOURCE_INVALID');
  }
  return response.member;
}

async function loadPortableMemberDefinition() {
  const { parsePortableDefinition, transformPortableDefinition } = await import('../tools/portable-data-definition-core.mjs');
  const source = fs.readFileSync(path.join(ROOT, 'schema', 'Member.yml'), 'utf8');
  return transformPortableDefinition(parsePortableDefinition(source));
}

function bridgeGasOptionalEmptyNumbers(member, schema) {
  const bridged = { ...member };
  for (const field of schema.fields) {
    if (field.type !== 'number' || field.required) continue;
    if (bridged[field.logicalName] === '') bridged[field.logicalName] = undefined;
  }
  return bridged;
}

async function run(options = {}) {
  const member = options.member || readRealMemberViaClasp();
  const definition = options.definition || await loadPortableMemberDefinition();
  const schema = renderFirestoreSchema(definition);
  const fieldCount = Object.keys(member).length;

  try {
    // GAS Sheets represents an empty cell as "". For an optional logical
    // number, bridge that physical empty value to the Renderer's existing
    // sparse-value representation. Do not coerce it to zero.
    const bridgedMember = bridgeGasOptionalEmptyNumbers(member, schema);
    const documents = renderFirestoreDocuments(schema, [bridgedMember]);
    const verification = verifyFirestoreDocuments(schema, documents);
    return {
      ok: verification.ok,
      diagnostic: 'MEMBER_GAS_TO_FIRESTORE_DRY_RUN',
      gas_dto_fields: fieldCount,
      pdd_fields: schema.fields.length,
      firestore_documents: documents.length,
      verification_errors: verification.errors.map(error => `${error.error}:${error.field}`),
      writes: 0
    };
  } catch (error) {
    return {
      ok: false,
      diagnostic: 'MEMBER_GAS_TO_FIRESTORE_DRY_RUN',
      gas_dto_fields: fieldCount,
      pdd_fields: schema.fields.length,
      first_error: sanitizedError(error),
      writes: 0
    };
  }
}

if (require.main === module) {
  run().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 2;
  }).catch(error => {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      diagnostic: 'MEMBER_GAS_TO_FIRESTORE_DRY_RUN',
      first_error: sanitizedError(error),
      writes: 0
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { run, sanitizedError, bridgeGasOptionalEmptyNumbers, buildRenderedMember };
