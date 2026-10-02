const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const headers = ['evidence_id', 'status', 'evidence_code', 'confirmed_at', 'remarks'];
const rows = [
  headers.slice(),
  ['EV-001', 'PENDING', '', '', 'keep'],
  ['EV-002', 'PENDING', '', '', 'other']
];

let setValuesCalls = 0;
let setValueCalls = 0;
let invalidatedSheet = null;
let writtenRange = null;
let writtenValues = null;

const sheet = {
  getName: () => '09_決済エビデンス',

  getLastColumn: () => headers.length,

  getDataRange: () => ({
    getValues: () => rows.map(row => row.slice())
  }),

  getRange: (row, column, numRows, numColumns) => ({
    getValues: () => {
      return rows
        .slice(row - 1, row - 1 + numRows)
        .map(sourceRow =>
          sourceRow.slice(column - 1, column - 1 + numColumns)
        );
    },

    setValues: values => {
      setValuesCalls++;
      writtenRange = { row, column, numRows, numColumns };
      writtenValues = values;
    },

    setValue: () => {
      setValueCalls++;
    }
  })
};

const context = {
  console,
  ensureSheetContext: ctx => ctx,
  getRequiredSheet_: () => sheet,
  getHeaderMap_: () => ({
    map: Object.fromEntries(headers.map((name, index) => [name, index]))
  }),
  invalidateSheetRows: (_ctx, sheetName) => {
    invalidatedSheet = sheetName;
  }
};

vm.createContext(context);
vm.runInContext(
  fs.readFileSync('gas/DAO_Core_Sheets.js', 'utf8'),
  context
);

const ctx = {
  ss: {
    getSheetByName: () => sheet
  }
};

const result = context.daoCoreSheets_updateByKey(
  'paymentEvidences',
  'evidence_id',
  'EV-001',
  {
    status: 'CONFIRMED',
    evidence_code: 'CODE-001',
    confirmed_at: '2026-10-02 09:00'
  },
  ctx
);

assert.strictEqual(result.found, true);
assert.strictEqual(setValuesCalls, 1, 'physical row must be written exactly once');
assert.strictEqual(setValueCalls, 0, 'single-cell setValue must not be used');

assert.deepStrictEqual(writtenRange, {
  row: 2,
  column: 1,
  numRows: 1,
  numColumns: headers.length
});

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(writtenValues)),
  [[
    'EV-001',
    'CONFIRMED',
    'CODE-001',
    '2026-10-02 09:00',
    'keep'
  ]]
);

assert.strictEqual(
  invalidatedSheet,
  '09_決済エビデンス',
  'sheet cache must be invalidated after update'
);

// Missing key must not write or invalidate.
setValuesCalls = 0;
setValueCalls = 0;
invalidatedSheet = null;

const missing = context.daoCoreSheets_updateByKey(
  'paymentEvidences',
  'evidence_id',
  'EV-NOT-FOUND',
  { status: 'CONFIRMED' },
  ctx
);

assert.strictEqual(missing.found, false);
assert.strictEqual(setValuesCalls, 0);
assert.strictEqual(setValueCalls, 0);
assert.strictEqual(invalidatedSheet, null);

console.log('PASS verify-dao-core-update-by-key');
