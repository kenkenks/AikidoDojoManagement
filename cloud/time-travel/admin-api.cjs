'use strict';

function createAdminTimeTravelApi({ verifyIdToken, getTimeTravel, saveTimeTravel }) {
  if (typeof verifyIdToken !== 'function') throw new Error('verifyIdToken is required');
  if (typeof getTimeTravel !== 'function') throw new Error('getTimeTravel is required');
  if (typeof saveTimeTravel !== 'function') throw new Error('saveTimeTravel is required');

  return async function handle({ method, url, authorization, body, authenticatedUser }) {
    const reply = (status, responseBody) => ({
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      body: responseBody
    });

    const match = /^Bearer ([^\s]+)$/i.exec(authorization || '');
    if (!authenticatedUser && !match) return reply(401, { error: 'UNAUTHENTICATED' });

    let user = authenticatedUser;

    try {
      if (!user) user = await verifyIdToken(match[1], true);
    } catch(error) {
      console.error('Firebase verifyIdToken failed:', {
        code: error?.code,
        message: error?.message
      });
      return reply(401, { error: 'UNAUTHENTICATED' });
    }
  
    if (!user || !user.uid || user.admin !== true) return reply(403, { error: 'FORBIDDEN' });

    if ((url || '') !== '/api/admin/time-travel') return reply(404, { error: 'NOT_FOUND' });

    if (method === 'GET') {
      try { return reply(200, await getTimeTravel()); }
      catch { return reply(503, { error: 'TIME_TRAVEL_READ_UNAVAILABLE' }); }
    }

    if (method === 'POST') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply(400, { error: 'INVALID_BODY' });
      }
      try { return reply(200, await saveTimeTravel(body)); }
      catch { return reply(503, { error: 'TIME_TRAVEL_SAVE_UNAVAILABLE' }); }
    }

    return reply(405, { error: 'METHOD_NOT_ALLOWED' });
  };
}

module.exports = { createAdminTimeTravelApi };
