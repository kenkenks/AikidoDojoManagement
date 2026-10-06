'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const beforePath = path.join(root, 'schema/migration/Member/Member.before.json');
const afterPath = path.join(root, 'schema/migration/Member/Member.after.json');
const outputPath = path.join(root, 'gas/DojoPddMigrateMember.generated.js');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildMemberMigrationDefinition(before, after) {
  if (before.entity !== 'member' || after.entity !== before.entity) {
    throw new Error('Member migration entity mismatch');
  }
  if (before.source !== after.source || before.sheet !== after.sheet) {
    throw new Error('Member migration source identity mismatch');
  }
  if (!Array.isArray(before.headers) || !Array.isArray(after.headers) || before.headers.length !== after.headers.length) {
    throw new Error('Member migration header count mismatch');
  }
  return {
    entity: before.entity,
    source: before.source,
    sheet: before.sheet,
    beforeHeaders: before.headers.slice(),
    afterHeaders: after.headers.slice()
  };
}

function renderGas(definition) {
  return [
    '/* Generated from schema/migration/Member/Member.before.json and Member.after.json. Do not edit. */',
    'function dojoPddDescribeMemberMigration_() {',
    '  return ' + JSON.stringify(definition, null, 2).replace(/^/gm, '  ').trimStart() + ';',
    '}',
    ''
  ].join('\n');
}

function main() {
  const before = readJson(beforePath);
  const after = readJson(afterPath);
  const definition = buildMemberMigrationDefinition(before, after);
  fs.writeFileSync(outputPath, renderGas(definition), 'utf8');
  process.stdout.write(`Generated ${path.relative(root, outputPath)}\n`);
}

if (require.main === module) main();

module.exports = { buildMemberMigrationDefinition, renderGas };
