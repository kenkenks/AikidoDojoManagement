const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const teacher = fs.readFileSync(path.join(root, 'gas/20_PaymentStatusTeacher.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'gas/20_PaymentStatusView.js'), 'utf8');

test('PaymentStatusTeacher reads Member through logical DTO boundary', () => {
  const fn = teacher.match(/function paymentStatusTeacher_makeMonthlyRows_\([\s\S]*?\n}\n/);
  assert.ok(fn, 'paymentStatusTeacher_makeMonthlyRows_ not found');
  assert.match(fn[0], /daoMemberGetAll_\(ctx\)/);
  assert.doesNotMatch(fn[0], /getMembers\(ctx\)/);
  assert.match(fn[0], /member\.billing_group_id/);
  assert.match(fn[0], /member\.member_name/);
  assert.match(fn[0], /member\.status/);
  assert.doesNotMatch(fn[0], /isActiveMasterRow_\(member\)/);
});

test('PaymentStatusView reads Member through logical DTO boundary', () => {
  const fn = view.match(/function paymentStatusView_collectContext\([\s\S]*?\n}\n/);
  assert.ok(fn, 'paymentStatusView_collectContext not found');
  assert.match(fn[0], /daoMemberGetAll_\(ctx\)/);
  assert.doesNotMatch(fn[0], /const members = getMembers\(ctx\)/);
  assert.match(fn[0], /m\.member_id/);
  assert.match(fn[0], /member\.member_name/);
  assert.match(fn[0], /member\.billing_group_id/);
});
