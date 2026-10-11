'use strict';
const { createAdminTimeTravelApi } = require('../time-travel/admin-api.cjs');

function createAdminApi({ verifyIdToken, getTimeTravel, saveTimeTravel, readMember, readMembers }) {
  if (typeof verifyIdToken !== 'function') throw new Error('verifyIdToken is required');
  if (typeof readMember !== 'function') throw new Error('readMember is required');
  if (typeof readMembers !== 'function') throw new Error('readMembers is required');
  const timeTravel = createAdminTimeTravelApi({ verifyIdToken, getTimeTravel, saveTimeTravel });
  const reply = (status, body) => ({ status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'
  }, body });
  return async function handle(request) {
    const url = request.url || '';
    const member = /^\/api\/admin\/members\/([^/?#]+)$/.exec(url);
    const members = url === '/api/admin/members';
    const capabilities = url === '/api/admin/capabilities';
    if (!member && !members && !capabilities && url !== '/api/admin/time-travel') return reply(404, { error: 'NOT_FOUND' });
    const match = /^Bearer ([^\s]+)$/i.exec(request.authorization || '');
    if (!match) return reply(401, { error: 'UNAUTHENTICATED' });
    let user;
    try { user = await verifyIdToken(match[1], true); }
    catch { return reply(401, { error: 'UNAUTHENTICATED' }); }
    if (!user || !user.uid || user.admin !== true) return reply(403, { error: 'FORBIDDEN' });
    if (capabilities) {
      if (request.method !== 'GET') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
      return reply(200, {
        contract: 'dojo-admin-api-v1',
        revision: process.env.K_REVISION || null,
        capabilities: ['time-travel.read', 'member.readById', 'member.readByIds']
      });
    }
    if (!member && !members) return timeTravel({ ...request, authenticatedUser: user });
    if (members) {
      if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
      const ids = request.body?.ids;
      if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !id || id === '.' || id === '..' || /[\/\\\x00-\x1f]/.test(id))) {
        return reply(400, { error: 'INVALID_MEMBER_IDS' });
      }
      try { return reply(200, { members: await readMembers(ids) }); }
      catch (error) {
        if (error?.message === 'INVALID_STORAGE_ID') return reply(400, { error: 'INVALID_MEMBER_IDS' });
        return reply(503, { error: 'MEMBER_READ_UNAVAILABLE' });
      }
    }
    if (request.method !== 'GET') return reply(405, { error: 'METHOD_NOT_ALLOWED' });
    let id;
    try { id = decodeURIComponent(member[1]); }
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
