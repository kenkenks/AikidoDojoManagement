'use strict';

// Shared entry point. Reuse existing authenticated handlers; do not create per-action APIs.
const WebConnectCore = require('../../shared/WebConnectCore.js');

function createDispatch(handle) {
  if (typeof handle !== 'function') throw new Error('handle is required');
  return async function dispatch({ action, input, context, method }) {
    const contract = action === 'qr_generator_options'
      ? { operation: 'qrGenerator.options', input: null }
      : WebConnectCore.resolve(action, input);
    const reply = (status, body) => ({ status, headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'
    }, body });
    if (!contract) return reply(404, { error: 'UNKNOWN_ACTION' });
    if (['billing.cashAccept', 'billing.paypayPostSelected', 'billing.paypayCodeStart', 'billing.paypayCodeRecord'].includes(contract.operation) && String(method || '').toUpperCase() !== 'POST') {
      return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    }
    // GET query includes the routing action; memberState accepts only its four domain keys.
    if (contract.operation === 'attendance.memberState' && contract.input) {
      const { action: _action, ...domainInput } = contract.input;
      contract.input = domainInput;
    }
    // All connected operations use the existing handler without HTTP URL construction.
    if (contract.operation === 'attendance.savedState' &&
        ['member_id', 'location_id', 'billing_block_id', 'attendance_date'].some(
          key => typeof contract.input?.[key] !== 'string')) {
      return reply(400, { error: 'INVALID_ATTENDANCE_PARAMS' });
    }
    return handle({ operation: contract.operation, input: contract.input, method,
      authorization: context && context.authorization });

  };
}

module.exports = { createDispatch };
