'use strict';

const fs = require('node:fs');
const path = require('node:path');

const target = path.resolve(__dirname, 'classify-member-migration-references.cjs');
let source = fs.readFileSync(target, 'utf8');

const anchor = `  if (file.startsWith('schema/migration/Member/') ||
      /verify-pdd-member-(before|mapping|migration|scanner|classifier)/.test(file)) {
    return { classification: 'KEEP', reason: 'migration-spec' };
  }`;

const replacement = `${anchor}
  if (file.startsWith('work/') && /-baseline\\.txt$/.test(file)) {
    return { classification: 'KEEP', reason: 'baseline-snapshot' };
  }`;

if (source.includes(`reason: 'baseline-snapshot'`)) {
  console.log('Step 6c already applied.');
  process.exit(0);
}
if (!source.includes(anchor)) {
  throw new Error('PDD_MEMBER_STEP6C_ANCHOR_NOT_FOUND');
}

source = source.replace(anchor, replacement);
fs.writeFileSync(target, source, 'utf8');
console.log('Applied Step 6c: work/*-baseline.txt => KEEP.');
