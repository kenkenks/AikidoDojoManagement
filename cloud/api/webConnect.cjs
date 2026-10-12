'use strict';

// Shared entry point. Reuse existing authenticated handlers; do not create per-action APIs.
const WebConnectCore = require('../../shared/WebConnectCore.js');

function createDispatch(handle) {
  if (typeof handle !== 'function') throw new Error('handle is required');
  return async function dispatch({ action, input, context }) {
    const contract = WebConnectCore.resolve(action, input);
    const reply = (status, body) => ({ status, headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'
    }, body });
    if (!contract) return reply(404, { error: 'UNKNOWN_ACTION' });
    // All connected operations use the existing handler without HTTP URL construction.
    if (contract.operation === 'attendance.savedState' &&
        ['member_id', 'location_id', 'billing_block_id', 'attendance_date'].some(
          key => typeof contract.input?.[key] !== 'string')) {
      return reply(400, { error: 'INVALID_ATTENDANCE_PARAMS' });
    }
    return handle({ operation: contract.operation, input: contract.input,
      authorization: context && context.authorization });

  };
}

module.exports = { createDispatch };
