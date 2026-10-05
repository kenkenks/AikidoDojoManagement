'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const mappingPath = path.join(repoRoot, 'schema/migration/Member/Member.mapping.json');

const EXCLUDED_DIR_NAMES = new Set([
  '.git',
  '.build',
  'node_modules'
]);

const EXCLUDED_RELATIVE_FILES = new Set([
  'schema/migration/Member/Member.before.json',
  'schema/migration/Member/Member.mapping.json',
  'schema/migration/Member/Member.after.json',
  'work/member-migration-scan.json',
  'work/member-migration-classified.json'
]);

const TEXT_EXTENSIONS = new Set([
  '.js', '.cjs', '.mjs', '.ts', '.tsx', '.json', '.yml', '.yaml',
  '.html', '.css', '.md', '.txt', '.csv', '.ps1', '.sh'
]);

function normalizeRelative(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

function shouldScanFile(file) {
  const relative = normalizeRelative(file);
  if (EXCLUDED_RELATIVE_FILES.has(relative)) return false;
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIR_NAMES.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (entry.isFile() && shouldScanFile(full)) {
      out.push(full);
    }
  }
  return out;
}

function findLiteralHits(text, needle) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    let fromIndex = 0;
    while (true) {
      const column = line.indexOf(needle, fromIndex);
      if (column < 0) break;
      hits.push({
        line: index + 1,
        column: column + 1,
        text: line.trim(),
        raw_text: line
      });
      fromIndex = column + needle.length;
    }
  });
  return hits;
}

function scanMigrationReferences(rootDir = repoRoot) {
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  const files = collectFiles(rootDir).sort();

  return {
    entity: mapping.entity,
    read_only: true,
    results: mapping.changes.map(change => {
      if (change.before === change.after) {
        return {
          before: change.before,
          after: change.after,
          action: 'no-change',
          hit_count: 0,
          files: []
        };
      }

      const matches = [];
      let hitCount = 0;

      for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        const hits = findLiteralHits(text, change.before);
        if (!hits.length) continue;

        hitCount += hits.length;
        matches.push({
          file: normalizeRelative(file),
          hits
        });
      }

      return {
        before: change.before,
        after: change.after,
        action: 'review',
        hit_count: hitCount,
        files: matches
      };
    })
  };
}

function printReport(report) {
  for (const result of report.results) {
    if (result.action === 'no-change') {
      console.log(`${result.before} -> ${result.after} [no-change]`);
      continue;
    }

    console.log(`${result.before} -> ${result.after} [hits: ${result.hit_count}]`);
    for (const file of result.files) {
      for (const hit of file.hits) {
        console.log(`  ${file.file}:${hit.line}:${hit.column}  ${hit.text}`);
      }
    }
  }
}

function resolveOutputPath(outputArg, cwd = process.cwd()) {
  if (!outputArg) return null;

  const outputPath = path.resolve(cwd, outputArg);
  if (outputPath === path.resolve(mappingPath)) {
    throw new Error('Refusing to overwrite Member.mapping.json with scanner output');
  }
  return outputPath;
}

function main() {
  const outputArg = process.argv[2];
  const outputPath = resolveOutputPath(outputArg);
  const report = scanMigrationReferences();

  printReport(report);

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  EXCLUDED_RELATIVE_FILES,
  findLiteralHits,
  resolveOutputPath,
  scanMigrationReferences
};
