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
    const routes = {
      'systemContext.read': ['GET', '/api/system/context'],
      'timeTravel.read': ['GET', '/api/system/admin/time-travel'],
      'timeTravel.save': ['POST', '/api/system/admin/time-travel']
    };
    const target = routes[contract.operation];
    if (!target) return reply(501, { error: 'OPERATION_NOT_CONNECTED' });
    return handle({ method: target[0], url: target[1],
      authorization: context && context.authorization,
      body: target[0] === 'POST' ? contract.input : null });
  };
}

module.exports = { createDispatch };
