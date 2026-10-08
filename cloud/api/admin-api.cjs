'use strict';
const { createAdminTimeTravelApi } = require('../time-travel/admin-api.cjs');

function createAdminApi({ verifyIdToken, getTimeTravel, saveTimeTravel, readMember }) {
  if (typeof verifyIdToken !== 'function') throw new Error('verifyIdToken is required');
  if (typeof readMember !== 'function') throw new Error('readMember is required');
  const timeTravel = createAdminTimeTravelApi({ verifyIdToken, getTimeTravel, saveTimeTravel });
  const reply = (status, body) => ({ status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'
  }, body });
  return async function handle(request) {
    const url = request.url || '';
    const member = /^\/api\/admin\/members\/([^/?#]+)$/.exec(url);
    if (!member && url !== '/api/admin/time-travel') return reply(404, { error: 'NOT_FOUND' });
    const match = /^Bearer ([^\s]+)$/i.exec(request.authorization || '');
    if (!match) return reply(401, { error: 'UNAUTHENTICATED' });
    let user;
    try { user = await verifyIdToken(match[1], true); }
    catch { return reply(401, { error: 'UNAUTHENTICATED' }); }
    if (!user || !user.uid || user.admin !== true) return reply(403, { error: 'FORBIDDEN' });
    if (!member) return timeTravel({ ...request, authenticatedUser: user });
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
