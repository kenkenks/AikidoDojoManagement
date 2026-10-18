'use strict';

// Transport-independent contracts. No Firestore writes are enabled here.
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const CODE = /^[\x21-\x7e]{1,128}$/;

class PayPayCommandContractError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PayPayCommandContractError';
    this.code = code;
    this.status = 400;
  }
}
const fail = code => { throw new PayPayCommandContractError(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && ID.test(value);
function keys(value, allowed, error) {
  if (!record(value) || Object.keys(value).some(key => !allowed.has(key))) fail(error);
}
function validatePayPayCodeRecord(input) {
  keys(input, new Set(['request_id','member_id','evidence_id','evidence_code']), 'INVALID_PAYPAY_CODE_RECORD');
  if (!REQUEST_ID.test(input.request_id || '') || !id(input.member_id) || !id(input.evidence_id) ||
      typeof input.evidence_code !== 'string' || !CODE.test(input.evidence_code) ||
      input.evidence_code.trim() !== input.evidence_code) fail('INVALID_PAYPAY_CODE_RECORD');
  return Object.freeze({...input});
}
function validatePayPayCodeStart(input) {
  keys(input, new Set(['request_id','member_id','plan_id','reception_date']), 'INVALID_PAYPAY_CODE_START');
  if (!REQUEST_ID.test(input.request_id || '') || !id(input.member_id) ||
      (input.plan_id !== undefined && input.plan_id !== '' && !id(input.plan_id)) ||
      (input.reception_date !== undefined && input.reception_date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(input.reception_date))) {
    fail('INVALID_PAYPAY_CODE_START');
  }
  return Object.freeze({...input});
}
function validatePayPayCodeRecordBatch(input) {
  keys(input, new Set(['request_id','member_id','evidence_code','evidence_items']), 'INVALID_PAYPAY_CODE_RECORD');
  if (!REQUEST_ID.test(input.request_id || '') || !id(input.member_id) ||
      typeof input.evidence_code !== 'string' || !CODE.test(input.evidence_code) ||
      input.evidence_code.trim() !== input.evidence_code || !Array.isArray(input.evidence_items) ||
      input.evidence_items.length < 1 || input.evidence_items.length > 20) fail('INVALID_PAYPAY_CODE_RECORD');
  const seen = new Set();
  const evidence_items = input.evidence_items.map(item => {
    keys(item, new Set(['evidence_id']), 'INVALID_PAYPAY_CODE_RECORD');
    if (!id(item.evidence_id) || seen.has(item.evidence_id)) fail('INVALID_PAYPAY_CODE_RECORD');
    seen.add(item.evidence_id);
    return Object.freeze({evidence_id:item.evidence_id});
  });
  return Object.freeze({...input,evidence_items:Object.freeze(evidence_items)});
}
function validatePayPayPostSelected(input) {
  keys(input, new Set(['request_id','location_id','billing_block_id','reception_session_id','evidence_items']), 'INVALID_PAYPAY_POST_SELECTED');
  if (!REQUEST_ID.test(input.request_id || '') || !id(input.location_id) || !id(input.billing_block_id) ||
      (input.reception_session_id !== undefined && input.reception_session_id !== '' && !id(input.reception_session_id)) ||
      !Array.isArray(input.evidence_items) || input.evidence_items.length < 1 || input.evidence_items.length > 100) fail('INVALID_PAYPAY_POST_SELECTED');
  const seen = new Set();
  const items = input.evidence_items.map(item => {
    keys(item, new Set(['evidence_id']), 'INVALID_PAYPAY_POST_SELECTED');
    if (!id(item.evidence_id) || seen.has(item.evidence_id)) fail('INVALID_PAYPAY_POST_SELECTED');
    seen.add(item.evidence_id);
    return Object.freeze({evidence_id:item.evidence_id});
  });
  return Object.freeze({...input, evidence_items:Object.freeze(items)});
}
module.exports = {PayPayCommandContractError,validatePayPayCodeRecord,validatePayPayCodeStart,validatePayPayCodeRecordBatch,validatePayPayPostSelected};
