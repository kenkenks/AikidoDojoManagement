'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const beforePath = path.join(root, 'schema/migration/Member/Member.before.json');
const mappingPath = path.join(root, 'schema/migration/Member/Member.mapping.json');
const afterPath = path.join(root, 'schema/migration/Member/Member.after.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildAfter(before, mapping) {
  if (before.entity !== mapping.entity) {
    throw new Error(`Entity mismatch: before=${before.entity}, mapping=${mapping.entity}`);
  }

  const byBefore = new Map();
  for (const change of mapping.changes) {
    if (!change || typeof change.before !== 'string' || typeof change.after !== 'string') {
      throw new Error('Invalid mapping entry');
    }
    if (byBefore.has(change.before)) {
      throw new Error(`Duplicate mapping source: ${change.before}`);
    }
    byBefore.set(change.before, change.after);
  }

  const headers = before.headers.map(header => {
    if (!byBefore.has(header)) {
      throw new Error(`Missing mapping for Before header: ${header}`);
    }
    return byBefore.get(header);
  });

  if (byBefore.size !== before.headers.length) {
    const beforeSet = new Set(before.headers);
    const extras = [...byBefore.keys()].filter(key => !beforeSet.has(key));
    throw new Error(`Mapping contains unknown Before header(s): ${extras.join(', ')}`);
  }

  if (new Set(headers).size !== headers.length) {
    throw new Error('After contains duplicate headers');
  }

  return {
    entity: before.entity,
    source: before.source,
    sheet: before.sheet,
    headers
  };
}

function main() {
  const before = readJson(beforePath);
  const mapping = readJson(mappingPath);
  const after = buildAfter(before, mapping);
  fs.writeFileSync(afterPath, JSON.stringify(after, null, 2) + '\n', 'utf8');
  process.stdout.write(`Generated ${path.relative(root, afterPath)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { buildAfter };
