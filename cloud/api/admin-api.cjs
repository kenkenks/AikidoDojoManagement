'use strict';
const { createAdminTimeTravelApi } = require('../time-travel/admin-api.cjs');
const WebConnectCore = require('../../shared/WebConnectCore.js');

function createAdminApi({ verifyIdToken, getTimeTravel, saveTimeTravel, getSystemContext, readMember, readMembers, readAttendanceSavedState, readAttendanceSessionInfo, readQrGeneratorOptions }) {
  if (typeof verifyIdToken !== 'function') throw new Error('verifyIdToken is required');
  if (typeof getSystemContext !== 'function') throw new Error('getSystemContext is required');
  if (typeof readMember !== 'function') throw new Error('readMember is required');
  if (typeof readMembers !== 'function') throw new Error('readMembers is required');
  const timeTravel = createAdminTimeTravelApi({ verifyIdToken, getTimeTravel, saveTimeTravel });
  const reply = (status, body) => ({ status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'
  }, body });
  return async function handle(request) {
    const url = request.url || '';
    // Transport-neutral operations share the same authentication and DAO path.
    const operation = request.operation || null;
    const operationInput = request.input || null;
    const systemContext = url === '/api/system/context' || operation === 'systemContext.read';
    const attendanceSession = operation === 'attendance.sessionInfo';
    const qrOptions = operation === 'qrGenerator.options';
    const attendance = url.split('?')[0] === '/api/admin/attendance/saved-state' || operation === 'attendance.savedState';
    const member = /^\/api\/admin\/members\/([^/?#]+)$/.exec(url);
    const members = url === '/api/admin/members' || operation === 'member.readByIds';
    const memberOperation = operation === 'member.readById';
    const capabilities = url === '/api/admin/capabilities';
    const systemTimeTravel = url === '/api/system/admin/time-travel' || operation === 'timeTravel.read' || operation === 'timeTravel.save';
    if (!systemContext && !qrOptions && !attendanceSession && !attendance && !member && !memberOperation && !members && !capabilities && url !== '/api/admin/time-travel' && !systemTimeTravel) return reply(404, { error: 'NOT_FOUND' });
    // Public operational clock: no login required; no admin configuration or member data.
    if (systemContext) {
      if (!operation && request.method !== 'GET') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
      try {
        const value = await getSystemContext();
        if (!value || value.ok !== true || typeof value.system_now !== 'string' ||
            !/^\d{4}-\d{2}$/.test(value.target_month || '') || typeof value.time_travel_enabled !== 'boolean') {
          return reply(503, { error: 'SYSTEM_CONTEXT_UNAVAILABLE' });
        }
        return reply(200, { ok: true, system_now: value.system_now,
          target_month: value.target_month, time_travel_enabled: value.time_travel_enabled,
          timezone: value.timezone || 'Asia/Tokyo' });
      } catch { return reply(503, { error: 'SYSTEM_CONTEXT_UNAVAILABLE' }); }
    }
    const match = /^Bearer ([^\s]+)$/i.exec(request.authorization || '');
    if (!match) return reply(401, { error: 'UNAUTHENTICATED' });
    let user;
    try { user = await verifyIdToken(match[1], true); }
    catch { return reply(401, { error: 'UNAUTHENTICATED' }); }
    if (!user || !user.uid) return reply(403, { error: 'FORBIDDEN' });
    if (user.admin !== true) return reply(403, { error: 'FORBIDDEN' });
    if (qrOptions) {
      if (typeof readQrGeneratorOptions !== 'function') return reply(503, { error: 'QR_OPTIONS_UNAVAILABLE' });
      try { return reply(200, await readQrGeneratorOptions()); }
      catch { return reply(503, { error: 'QR_OPTIONS_UNAVAILABLE' }); }
    }
    if (attendanceSession) {
      if (typeof operationInput?.location_id !== 'string' || !operationInput.location_id ||
          (operationInput.billing_block_id != null && typeof operationInput.billing_block_id !== 'string') ||
          (operationInput.at != null && typeof operationInput.at !== 'string')) {
        return reply(400, { error: 'INVALID_SESSION_INFO_PARAMS' });
      }
      if (typeof readAttendanceSessionInfo !== 'function') return reply(503, { error: 'SESSION_INFO_UNAVAILABLE' });
      try {
        const result = await readAttendanceSessionInfo(operationInput);
        return reply(result?.ok ? 200 : 400, result);
      } catch { return reply(503, { error: 'SESSION_INFO_UNAVAILABLE' }); }
    }
    if (attendance) {
      if (!operation && request.method !== 'GET') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
      const parsed = new URL(url, 'http://localhost');
      const keys = ['member_id', 'location_id', 'billing_block_id', 'attendance_date'];
      if (operation ? keys.some(key => typeof operationInput?.[key] !== 'string') : keys.some(key => parsed.searchParams.getAll(key).length !== 1)) {
        return reply(400, { error: 'INVALID_ATTENDANCE_PARAMS' });
      }
      if (typeof readAttendanceSavedState !== 'function') return reply(503, { error: 'ATTENDANCE_READ_UNAVAILABLE' });
      const params = operation ? Object.fromEntries(keys.map(key => [key, operationInput[key]])) : Object.fromEntries(keys.map(key => [key, parsed.searchParams.get(key)]));
      try {
        const result = await readAttendanceSavedState(params);
        return reply(result.ok ? 200 : 400, result);
      } catch {
        return reply(503, { error: 'ATTENDANCE_READ_UNAVAILABLE' });
      }
    }
    if (capabilities) {
      if (request.method !== 'GET') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
      return reply(200, {
        contract: 'dojo-admin-api-v1',
        revision: process.env.K_REVISION || null,
        capabilities: ['time-travel.read', 'member.readById', 'member.readByIds', 'attendance.savedState.read']
      });
    }
    if (!member && !memberOperation && !members) {
      if (systemTimeTravel) {
        if (operation) return timeTravel({ ...request, authenticatedUser: user });
        const contract = WebConnectCore.route({
          method: request.method,
          action: request.method === 'GET' ? 'time_travel_admin' : 'time_travel_set',
          data: request.body
        });
        if (!contract) return reply(405, { error: 'METHOD_NOT_ALLOWED' });
        return timeTravel({ ...request, url: '/api/admin/time-travel',
          body: contract.operation === 'timeTravel.save' ? contract.input : null,
          authenticatedUser: user });
      }
      return timeTravel({ ...request, authenticatedUser: user });
    }
    if (members) {
      if (!operation && request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
      const ids = operation ? operationInput?.ids : request.body?.ids;
      if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !id || id === '.' || id === '..' || /[\/\\\x00-\x1f]/.test(id))) {
        return reply(400, { error: 'INVALID_MEMBER_IDS' });
      }
      try { return reply(200, { members: await readMembers(ids) }); }
      catch (error) {
        if (error?.message === 'INVALID_STORAGE_ID') return reply(400, { error: 'INVALID_MEMBER_IDS' });
        return reply(503, { error: 'MEMBER_READ_UNAVAILABLE' });
      }
    }
    if (!operation && request.method !== 'GET') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    let id;
    try { id = memberOperation ? operationInput?.member_id : decodeURIComponent(member[1]); }
    catch { return reply(400, { error: 'INVALID_MEMBER_ID' }); }
    if (!id || id === '.' || id === '..' || /[\/\\\x00-\x1f]/.test(id)) return reply(400, { error: 'INVALID_MEMBER_ID' });
    try {
      const value = await readMember(id);
      return value === null ? reply(404, { error: 'MEMBER_NOT_FOUND' }) : reply(200, value);
    } catch (error) {
      if (error?.message === 'INVALID_STORAGE_ID') return reply(400, { error: 'INVALID_MEMBER_ID' });
      return reply(503, { error: 'MEMBER_READ_UNAVAILABLE' });
    }
  };
}
module.exports = { createAdminApi };
