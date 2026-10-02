'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const runtimeFiles = [
  'gas/09_PaymentEvidencePost.js',
  'gas/09_PaymentEvidenceRecord.js',
  'gas/paypay_code.js',
];

for (const rel of runtimeFiles) {
  const src = read(rel);
  assert.equal(
    src.includes('DojoPortableDaoPaymentEvidence'),
    false,
    `${rel} must not depend on DojoPortableDaoPaymentEvidence`
  );
}

const post = read('gas/09_PaymentEvidencePost.js');
const record = read('gas/09_PaymentEvidenceRecord.js');
const paypay = read('gas/paypay_code.js');
const dao = read('gas/DAO_Business_Payment.js');

assert.match(post, /\bdaoPaymentFindEvidence_\s*\(/);
assert.match(post, /\bdaoPaymentUpdateEvidenceById_\s*\(/);
assert.match(record, /\bdaoPaymentFindEvidence_\s*\(/);
assert.match(record, /\bdaoPaymentUpdateEvidenceById_\s*\(/);
assert.match(paypay, /\bdaoPaymentFindEvidence_\s*\(/);
assert.match(paypay, /\bdaoPaymentUpdateEvidenceById_\s*\(/);

assert.match(
  dao,
  /function\s+daoPaymentUpdateEvidenceById_\s*\(/
);
assert.match(
  dao,
  /daoPaymentUpdateEvidenceById_[\s\S]*?updateByKey\s*\(/
);

console.log('PASS verify-payment-evidence-canonical-rewire');
