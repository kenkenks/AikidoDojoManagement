import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const fee = { plan_id: 'P002', 会費タイプ: '回数料金', 回数単価: 1500, 上限金額: 7500 };
const specs = [['月', '10:30', '12:30'], ['金', '10:30', '12:30'], ['日', '10:30', '12:30'], ['日', '14:30', '16:30'], ['水', '19:30', '21:30']];
const blocks = specs.map(([曜日], i) => ({ 曜日, location_id: 'HONBU', billing_block_id: 'B' + i }));
const slots = specs.map(([, 開始時刻, 終了時刻], i) => ({ 開始時刻, 終了時刻, location_id: 'HONBU', billing_block_id: 'B' + i, slot_id: 'S' + i }));
const context = vm.createContext({
  createSheetContext: () => ({}), Logger: { log() {} },
  getTeachers: () => [{ teacher_id: 'T001', 出席受付可: true }],
  getMembers: () => [{ member_id: 'M001', 請求グループID: 'G001' }],
  getFees: () => [fee], getBillingBlocks: () => blocks, getTrainingSlots: () => slots,
  isActiveMasterRow_: () => true, isTrueValue_: Boolean, normalizeId_: String,
  weekdayMatches_: (a, b) => a === b,
  timeToMinutes_: s => s.split(':').reduce((h, m) => Number(h) * 60 + Number(m)),
  minutesToTimeText_: n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`,
  // Preflight must return before reaching any transaction access or write.
  invalidateInvoices: () => { throw new Error('transaction boundary reached'); }
});
vm.runInContext(fs.readFileSync('gas/03_BillingRunner.js', 'utf8'), context);
const run = () => context.runner_billing_story_004_perUseComplexMonth_preflight();
assert.equal(run().ok, true);
assert.equal(run().read_only, true);
for (const cap of [0, 6000, 9000]) {
  fee.上限金額 = cap;
  assert.equal(run().ok, false);
}
fee.月額上限 = 7500;
assert.equal(run().ok, false, 'legacy alias must not override actual cap');
fee.上限金額 = 7500;
slots.pop();
assert.equal(run().ok, false, 'missing scope must stop before writes');
console.log('Per-use preflight: PASS (valid configuration, cap mismatches, missing scope, no transaction access)');
