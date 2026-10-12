'use strict';
// Isolated HTTP adapter. No route is published until the QR verifier is wired.
const {createAttendanceSavedState} = require('./saved-state.cjs');
const WebConnectCore = require('../../shared/WebConnectCore.js');
const reply = (status, body) => ({status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}, body});
const fields = ['member_id','attendance_date','location_id','billing_block_id'];
function createAttendanceGetApi({memberDao,attendanceDao,authorizeQr}) {
  if (typeof authorizeQr !== 'function') throw new TypeError('authorizeQr is required');
  const read = createAttendanceSavedState({memberDao,attendanceDao});
  return async function handle(request) {
    const rawUrl = String(request && request.url || '');
    let url;
    try { url = new URL(rawUrl, 'https://dojo.invalid'); }
    catch { return reply(400,{error:'INVALID_URL'}); }
    if (url.pathname !== '/api/attendance/saved-state') return reply(404,{error:'NOT_FOUND'});
    if (request.method !== 'GET') return reply(405,{error:'METHOD_NOT_ALLOWED'});
    const params = Object.fromEntries(fields.map(key=>[key,url.searchParams.get(key) || '']));
    const contract = WebConnectCore.route({method:'GET',action:'attendance_saved_state',params});
    if (!contract || contract.operation !== 'attendance.savedState') return reply(503,{error:'CONTRACT_UNAVAILABLE'});
    // A QR credential must be checked and bound to the requested member.
    // Never trust member_id supplied by the browser as authentication.
    let authorized = false;
    try { authorized = (await authorizeQr({request,memberId:params.member_id})) === true; }
    catch { /* fail closed */ }
    if (!authorized) return reply(403,{error:'FORBIDDEN'});
    try {
      const result = await read(contract.input);
      return reply(result.ok ? 200 : 400,result);
    } catch { return reply(503,{error:'ATTENDANCE_READ_UNAVAILABLE'}); }
  };
}
module.exports={createAttendanceGetApi};
