'use strict';

// Step 10C-1: transport/storage independent command boundary.
// Firestore transaction orchestration is injected by Step 10C-2.
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const TOP_LEVEL_KEYS = new Set([
  'request_id', 'location_id', 'billing_block_id', 'reception_session_id', 'items'
]);
const ITEM_KEYS = new Set(['member_id', 'billing_group_id']);

class PaymentCashAcceptContractError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PaymentCashAcceptContractError';
    this.code = code;
    this.status = code === 'PAYMENT_CASH_ACCEPT_FORBIDDEN' ? 403 : 400;
  }
}

function fail(code) {
  throw new PaymentCashAcceptContractError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredId(value) {
  return typeof value === 'string' && ID.test(value);
}

function validatePaymentCashAcceptInput(input) {
  if (!isRecord(input) || Object.keys(input).some(key => !TOP_LEVEL_KEYS.has(key))) {
    fail('INVALID_PAYMENT_CASH_ACCEPT_PARAMS');
  }
  if (!REQUEST_ID.test(input.request_id || '') ||
      !requiredId(input.location_id) ||
      !requiredId(input.billing_block_id) ||
      (input.reception_session_id !== undefined &&
        input.reception_session_id !== '' && !requiredId(input.reception_session_id)) ||
      !Array.isArray(input.items) || input.items.length !== 1) {
    fail('INVALID_PAYMENT_CASH_ACCEPT_PARAMS');
  }
  const item = input.items[0];
  if (!isRecord(item) || Object.keys(item).some(key => !ITEM_KEYS.has(key)) ||
      !requiredId(item.member_id) || !requiredId(item.billing_group_id)) {
    fail('INVALID_PAYMENT_CASH_ACCEPT_PARAMS');
  }
  return Object.freeze({
    request_id: input.request_id,
    location_id: input.location_id,
    billing_block_id: input.billing_block_id,
    reception_session_id: input.reception_session_id || '',
    items: Object.freeze([Object.freeze({
      member_id: item.member_id,
      billing_group_id: item.billing_group_id
    })])
  });
}

function createAdminReceptionActor(principal) {
  if (!isRecord(principal) || !requiredId(principal.uid)) {
    fail('PAYMENT_CASH_ACCEPT_UNAUTHENTICATED');
  }
  if (principal.admin !== true) fail('PAYMENT_CASH_ACCEPT_FORBIDDEN');
  // Authentication identity and business receptionist are deliberately separate fields.
  return Object.freeze({
    authenticated_uid: principal.uid,
    receptionist_type: 'ADMIN',
    receptionist_id: principal.uid,
    teacher_id: ''
  });
}

function createPaymentCashAcceptCommand({executeAtomic} = {}) {
  if (typeof executeAtomic !== 'function') throw new TypeError('PAYMENT_CASH_ACCEPT_ATOMIC_EXECUTOR_REQUIRED');
  return Object.freeze({
    execute(input, principal) {
      const request = validatePaymentCashAcceptInput(input);
      const actor = createAdminReceptionActor(principal);
      return executeAtomic(Object.freeze({request, actor}));
    }
  });
}

// Persistence contract for Step 10C-2. Existing entities keep their current names;
// only the idempotency receipt is new. Amounts and invoice allocation are server-derived.
const PAYMENT_CASH_ACCEPT_ENTITIES = Object.freeze({
  reads: Object.freeze([
    'members', 'invoices', 'payments', 'paymentEvidences',
    'dojos', 'billing_blocks', 'payment_cash_requests'
  ]),
  writes: Object.freeze([
    'payments', 'paymentEvidences', 'invoices', 'payment_cash_requests'
  ]),
  idempotency: Object.freeze({
    collection: 'payment_cash_requests',
    document_id: 'request_id',
    fields: Object.freeze([
      'request_id', 'input_hash', 'status', 'authenticated_uid',
      'receptionist_type', 'receptionist_id', 'business_datetime',
      'recorded_at', 'result'
    ])
  }),
  projection: Object.freeze({
    input: 'transaction snapshot of group invoices and payments',
    responsibility: 'reuse the existing payment allocation/status projection',
    output: 'per-invoice billed, paid, unpaid and next status; no writes'
  })
});

module.exports = {
  PaymentCashAcceptContractError,
  validatePaymentCashAcceptInput,
  createAdminReceptionActor,
  createPaymentCashAcceptCommand,
  PAYMENT_CASH_ACCEPT_ENTITIES
};
