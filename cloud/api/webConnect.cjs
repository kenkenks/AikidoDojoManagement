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
      'timeTravel.save': ['POST', '/api/system/admin/time-travel'],
      'attendance.savedState': ['GET', '/api/admin/attendance/saved-state'],
      'member.readById': ['GET', '/api/admin/members'],
      'member.readByIds': ['POST', '/api/admin/members']
    };
    const target = routes[contract.operation];
    if (!target) return reply(501, { error: 'OPERATION_NOT_CONNECTED' });
    let url = target[1];
    if (contract.operation === 'member.readById') {
      const id = contract.input?.member_id;
      if (typeof id !== 'string' || !id || id === '.' || id === '..' || /[\/\\\x00-\x1f]/.test(id)) return reply(400, { error: 'INVALID_MEMBER_ID' });
      url += '/' + encodeURIComponent(id);
    }
    if (contract.operation === 'member.readByIds') {
      const ids = contract.input?.ids;
      if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !id || id === '.' || id === '..' || /[\/\\\x00-\x1f]/.test(id))) return reply(400, { error: 'INVALID_MEMBER_IDS' });
    }
    if (contract.operation === 'attendance.savedState') {
      const params = new URLSearchParams();
      for (const key of ['member_id', 'location_id', 'billing_block_id', 'attendance_date']) {
        if (typeof contract.input?.[key] !== 'string') return reply(400, { error: 'INVALID_ATTENDANCE_PARAMS' });
        params.set(key, contract.input[key]);
      }
      url += '?' + params.toString();
    }
    return handle({ method: target[0], url,
      authorization: context && context.authorization,
      body: target[0] === 'POST' ? contract.input : null });
  };
}

module.exports = { createDispatch };
