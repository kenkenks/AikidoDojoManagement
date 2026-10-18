'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { createPayPayPostFirestoreExecutor } = require('../cloud/billing/payment-paypay-post-firestore.cjs');
const { createAttendanceRegistration } = require('../.build/portable-timetravel-firestore/DojoTimeTravelFirestore.cjs');

const HOST = '127.0.0.1:8085';
const PROJECT = 'demo-paypay-post-emulator';

if (process.env.FIRESTORE_EMULATOR_HOST !== HOST) {
  throw new Error('EMULATOR_HOST_NOT_CONFIRMED');
}
if (process.env.GCLOUD_PROJECT !== PROJECT || !PROJECT.startsWith('demo-')) {
  throw new Error('EMULATOR_PROJECT_NOT_CONFIRMED');
}
if (process.env.FIRESTORE_HOST || process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== PROJECT) {
  throw new Error('NON_EMULATOR_TARGET_DETECTED');
}

const runId = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
const app = initializeApp({ projectId: PROJECT }, `paypay-post-emulator-${runId}`);
const db = getFirestore(app);
const clock = {
  ok: true,
  timezone: 'Asia/Tokyo',
  system_now: '2026-10-18 12:00:00',
  target_month: '2026-10'
};

const projection = (ctx = { daoCore: {}, timezone: 'Asia/Tokyo', cache: {} }, dependencies = {}) =>
  createAttendanceRegistration(ctx, {
    uuid: () => { throw new Error('UUID_FORBIDDEN'); },
    ...dependencies
  });

const executor = createPayPayPostFirestoreExecutor(db, {
  getSystemContext: async () => clock,
  createProjection: () => projection(),
  serverTimestamp: () => FieldValue.serverTimestamp()
});

const actor = {
  authenticated_uid: `UID_${runId}`,
  receptionist_id: `TEACHER_${runId}`,
  teacher_id: `TEACHER_${runId}`
};

async function set(collection, id, value) {
  await db.collection(collection).doc(id).set(value);
}

async function get(collection, id) {
  const snapshot = await db.collection(collection).doc(id).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function countWhere(collection, field, value) {
  return (await db.collection(collection).where(field, '==', value).get()).size;
}

function ids(label) {
  const suffix = `${runId}_${label}`;
  return {
    member: `MEM_${suffix}`,
    group: `GRP_${suffix}`,
    invoice: `INV_${suffix}`,
    evidence: `EVD_${suffix}`,
    location: `LOC_${suffix}`,
    block: `BLK_${suffix}`,
    request: `REQ_${suffix}`
  };
}

function requestFor(value, evidenceId = value.evidence) {
  return {
    request_id: value.request,
    location_id: value.location,
    billing_block_id: value.block,
    reception_session_id: `SES_${runId}`,
    evidence_items: [{ evidence_id: evidenceId }]
  };
}

async function seedScope(value) {
  await set('dojos', value.location, {
    location_id: value.location,
    display_name: 'Emulator Dojo',
    status: 'ACTIVE'
  });
  await set('billing_blocks', value.block, {
    billing_block_id: value.block,
    location_id: value.location,
    display_name: 'Emulator Block',
    status: 'ACTIVE'
  });
}

async function seedPayPayFixture(label, amount = 1234) {
  const value = ids(label);
  await seedScope(value);
  await set('members', value.member, {
    member_id: value.member,
    member_name: `PayPay Emulator ${label}`,
    billing_group_id: value.group
  });
  await set('invoices', value.invoice, {
    invoice_id: value.invoice,
    target_month: clock.target_month,
    billing_group_id: value.group,
    member_id: value.member,
    plan_id: 'PLAN_TEST',
    '表示名': 'PayPay Emulator Invoice',
    '請求予定額': amount,
    '金額': amount,
    '支払状態': '未払い'
  });
  await set('paymentEvidences', value.evidence, {
    evidence_id: value.evidence,
    invoice_id: value.invoice,
    member_id: value.member,
    billing_group_id: value.group,
    payment_method: 'PayPay',
    evidence_code: `CODE_${runId}_${label}`,
    status: 'CONFIRMED',
    amount,
    confirmed_at: clock.system_now,
    confirmed_by: value.member
  });
  return value;
}

async function expectCode(action, code) {
  await assert.rejects(action, error => error && (error.code === code || error.message === code), `expected ${code}`);
}

async function test(name, action, report) {
  try {
    await action();
    report.tests.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.tests.push({ name, status: 'FAIL', reason: error?.message || String(error) });
    console.error(`FAIL ${name}: ${error?.message || error}`);
    throw error;
  }
}

async function main() {
  const report = {
    ok: false,
    host: process.env.FIRESTORE_EMULATOR_HOST,
    project: PROJECT,
    run_id: runId,
    tests: [],
    unsupported: [
      'The current PayPay post executor does not verify that paymentEvidences.member_id exists in members.'
    ]
  };

  try {
    await test('normal PayPay posting persists payment, evidence, invoice and receipt', async () => {
      const value = await seedPayPayFixture('NORMAL');
      const result = await executor({ request: requestFor(value), actor });
      assert.equal(result.ok, true);
      assert.equal(result.idempotent_replay, false);
      assert.equal(result.results.length, 1);

      const posted = result.results[0];
      const [payment, evidence, invoice, receipt] = await Promise.all([
        get('payments', posted.payment_id),
        get('paymentEvidences', value.evidence),
        get('invoices', value.invoice),
        get('payment_paypay_post_requests', value.request)
      ]);

      assert.equal(payment.invoice_id, value.invoice);
      assert.equal(payment.member_id, value.member);
      assert.equal(payment['支払方法'], 'PayPay');
      assert.equal(payment['入金額'], 1234);
      assert.equal(payment['決済ID'], value.evidence);
      assert.equal(payment.request_id, value.request);
      assert.ok(payment.recorded_at instanceof Timestamp);

      assert.equal(evidence.status, 'POSTED');
      assert.equal(evidence.payment_log_id, posted.payment_id);
      assert.equal(evidence.location_id, value.location);
      assert.equal(evidence.billing_block_id, value.block);
      assert.equal(invoice['支払状態'], posted.invoice_status);
      assert.equal(invoice['支払状態'], '支払済');

      assert.equal(receipt.request_id, value.request);
      assert.equal(receipt.status, 'COMPLETED');
      assert.equal(receipt.result.results[0].payment_id, posted.payment_id);
      assert.ok(receipt.recorded_at instanceof Timestamp);
    }, report);

    await test('same request replays idempotently without duplicate payment', async () => {
      const value = await seedPayPayFixture('REPLAY');
      const request = requestFor(value);
      const first = await executor({ request, actor });
      const replay = await executor({ request, actor });
      assert.equal(first.idempotent_replay, false);
      assert.equal(replay.idempotent_replay, true);
      assert.deepEqual(replay.results, first.results);
      assert.equal(await countWhere('payments', 'request_id', value.request), 1);
      assert.equal(await countWhere('payment_paypay_post_requests', 'request_id', value.request), 1);
    }, report);

    await test('invalid input is rejected before Firestore mutation', async () => {
      const value = await seedPayPayFixture('INVALID');
      const before = {
        payments: await countWhere('payments', 'request_id', value.request),
        requests: await countWhere('payment_paypay_post_requests', 'request_id', value.request)
      };
      await expectCode(
        () => executor({ request: { ...requestFor(value), evidence_items: [] }, actor }),
        'INVALID_PAYPAY_POST_SELECTED'
      );
      assert.equal(await countWhere('payments', 'request_id', value.request), before.payments);
      assert.equal(await countWhere('payment_paypay_post_requests', 'request_id', value.request), before.requests);
      assert.equal((await get('paymentEvidences', value.evidence)).status, 'CONFIRMED');
    }, report);

    await test('missing evidence and missing invoice are rejected without partial writes', async () => {
      const missingEvidence = ids('NO_EVIDENCE');
      await seedScope(missingEvidence);
      await expectCode(
        () => executor({ request: requestFor(missingEvidence), actor }),
        'PAYPAY_POST_EVIDENCE_INVALID'
      );
      assert.equal(await countWhere('payments', 'request_id', missingEvidence.request), 0);
      assert.equal(await countWhere('payment_paypay_post_requests', 'request_id', missingEvidence.request), 0);

      const missingInvoice = ids('NO_INVOICE');
      await seedScope(missingInvoice);
      await set('paymentEvidences', missingInvoice.evidence, {
        evidence_id: missingInvoice.evidence,
        invoice_id: missingInvoice.invoice,
        member_id: missingInvoice.member,
        billing_group_id: missingInvoice.group,
        payment_method: 'PayPay',
        evidence_code: `CODE_${runId}_NO_INVOICE`,
        status: 'CONFIRMED',
        amount: 500
      });
      await expectCode(
        () => executor({ request: requestFor(missingInvoice), actor }),
        'PAYPAY_POST_INVOICE_INVALID'
      );
      assert.equal(await countWhere('payments', 'request_id', missingInvoice.request), 0);
      assert.equal((await get('paymentEvidences', missingInvoice.evidence)).status, 'CONFIRMED');
    }, report);

    await test('unrelated documents remain byte-for-byte unchanged', async () => {
      const target = await seedPayPayFixture('ISOLATED_TARGET');
      const control = await seedPayPayFixture('ISOLATED_CONTROL', 9876);
      const controlBefore = {
        member: await get('members', control.member),
        invoice: await get('invoices', control.invoice),
        evidence: await get('paymentEvidences', control.evidence)
      };

      await executor({ request: requestFor(target), actor });

      assert.deepEqual(await get('members', control.member), controlBefore.member);
      assert.deepEqual(await get('invoices', control.invoice), controlBefore.invoice);
      assert.deepEqual(await get('paymentEvidences', control.evidence), controlBefore.evidence);
      assert.equal(await countWhere('payments', 'billing_group_id', control.group), 0);
      assert.equal((await get('paymentEvidences', target.evidence)).status, 'POSTED');
    }, report);

    report.ok = true;
    report.summary = {
      passed: report.tests.filter(item => item.status === 'PASS').length,
      failed: report.tests.filter(item => item.status === 'FAIL').length,
      unsupported: report.unsupported.length
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
