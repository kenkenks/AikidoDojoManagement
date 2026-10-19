'use strict';
const { createAdminTimeTravelApi } = require('../time-travel/admin-api.cjs');
const WebConnectCore = require('../../shared/WebConnectCore.js');
const { canAccessMember } = require('./dojo-principal.cjs');
const {validateAttendanceInput} = require('../../adapters/firestore/DAO_Core.js');

function createAdminApi({ verifyIdToken, getTimeTravel, saveTimeTravel, getSystemContext, readMember, readMembers, readMemberManagementList,saveManagedMember,saveManagedMemberGroup,withdrawManagedMember,readAttendanceSavedState, readMemberAttendanceState, readAttendanceSessionInfo, readQrGeneratorOptions, readAttendanceRankOptions, registerAttendanceBatch, resolveDojoPrincipal,readTeacherAttendanceToday,isActiveTeacher,readAttendanceProgressSummary,readBillingMemberInfo,readPaymentReceptionSummary,readPaymentScreen,acceptCashPayment,postPayPayPayment,startPayPayCode,recordPayPayCode,readPaperAttendanceOcr }) {
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
    const registration = operation === 'attendance.registerBatch';
    const memberState = operation === 'attendance.memberState';
    const progressSummary = operation === 'attendance.progressSummary';
    const billingMemberInfo = operation === 'billing.memberInfo';
    const receptionSummary = operation === 'billing.receptionSummary';
    const paymentScreen = operation === 'billing.screenRead';
    const cashAccept = operation === 'billing.cashAccept';
    const paypayPost = operation === 'billing.paypayPostSelected';
    const paypayCodeStart = operation === 'billing.paypayCodeStart';
    const paypayCodeRecord = operation === 'billing.paypayCodeRecord';
    const teacherToday=operation==='attendance.teacherToday';
    const paperOcr=operation==='attendance.paperOcr';
    const qrOptions = operation === 'qrGenerator.options';
    const rankOptions = operation === 'attendance.rankOptions';
    const attendance = url.split('?')[0] === '/api/admin/attendance/saved-state' || operation === 'attendance.savedState';
    const member = /^\/api\/admin\/members\/([^/?#]+)$/.exec(url);
    const members = url === '/api/admin/members' || operation === 'member.readByIds';
    const memberOperation = operation === 'member.readById';
    const memberManagementList=operation==='memberManagement.list';
    const memberManagementSave=operation==='memberManagement.save';
    const memberManagementGroupSave=operation==='memberManagement.groupSave';
    const memberManagementWithdraw=operation==='memberManagement.withdraw';
    const capabilities = url === '/api/admin/capabilities';
    const systemTimeTravel = url === '/api/system/admin/time-travel' || operation === 'timeTravel.read' || operation === 'timeTravel.save';
    if (!paperOcr&&!memberManagementList&&!memberManagementSave&&!memberManagementGroupSave&&!memberManagementWithdraw&&!paypayCodeStart && !paypayCodeRecord && !paypayPost && !cashAccept && !paymentScreen && !receptionSummary && !billingMemberInfo && !progressSummary && !systemContext && !teacherToday && !registration && !qrOptions && !rankOptions && !attendanceSession && !memberState && !attendance && !member && !memberOperation && !members && !capabilities && url !== '/api/admin/time-travel' && !systemTimeTravel) return reply(404, { error: 'NOT_FOUND' });
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
    if(paperOcr){
      if(String(request.method||'').toUpperCase()!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
      let allowed=user.admin===true;
      if(!allowed&&typeof resolveDojoPrincipal==='function'&&typeof isActiveTeacher==='function'){
        try{const principal=await resolveDojoPrincipal(user);allowed=!!principal?.teacher_id&&await isActiveTeacher(principal.teacher_id)===true;}catch{allowed=false;}
      }
      if(!allowed)return reply(403,{error:'FORBIDDEN'});
      if(typeof readPaperAttendanceOcr!=='function')return reply(503,{error:'PAPER_OCR_UNAVAILABLE'});
      try{return reply(200,await readPaperAttendanceOcr(operationInput));}
      catch(error){const status=[400,413].includes(error?.status)?error.status:503,code=status===503?'PAPER_OCR_UNAVAILABLE':error.code||'INVALID_PAPER_OCR_INPUT';return reply(status,{error:code});}
    }
    if(memberManagementList||memberManagementSave||memberManagementGroupSave||memberManagementWithdraw){
      if(String(request.method||'').toUpperCase()!==(memberManagementList?'GET':'POST'))return reply(405,{error:'METHOD_NOT_ALLOWED'});
      if(user.admin!==true)return reply(403,{error:'FORBIDDEN'});
      const execute=memberManagementList?readMemberManagementList:(memberManagementSave?saveManagedMember:(memberManagementGroupSave?saveManagedMemberGroup:withdrawManagedMember));
      if(typeof execute!=='function')return reply(503,{error:'MEMBER_MANAGEMENT_UNAVAILABLE'});
      try{return reply(200,await execute(operationInput||{},user));}
      catch(error){
        const code=typeof error?.code==='string'?error.code:'MEMBER_MANAGEMENT_UNAVAILABLE';
        const status=error?.status||(['INVALID_MEMBER_MANAGEMENT_INPUT','INVALID_MEMBER_GROUP_INPUT'].includes(code)?400:code==='MEMBER_NOT_FOUND'?404:['MEMBER_ALREADY_EXISTS','BILLING_GROUP_ALREADY_EXISTS','INVALID_MEMBER_GROUP_SIZE','MEMBER_GROUP_TYPE_UNAVAILABLE','MEMBER_GROUP_FEE_TYPE_MISMATCH','MEMBER_GROUP_PLAN_COUNT_MISMATCH'].includes(code)?409:503);
        return reply(status,{error:status===503?'MEMBER_MANAGEMENT_UNAVAILABLE':code});
      }
    }
    if(paypayCodeStart||paypayCodeRecord){
      if(String(request.method||'').toUpperCase()!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
      if(user.admin!==true)return reply(403,{error:'FORBIDDEN'});
      const execute=paypayCodeStart?startPayPayCode:recordPayPayCode;
      if(typeof execute!=='function')return reply(403,{error:'PAYPAY_CODE_DEV_ONLY'});
      try{return reply(200,await execute(operationInput,user));}
      catch(error){
        const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{2,80}$/.test(error.code)?error.code:'PAYPAY_CODE_UNAVAILABLE';
        const status=error?.status===400?400:error?.status===403?403:error?.status===409?409:503;
        if(status===503)console.error('[PAYPAY_CODE_ERROR]',{code});
        return reply(status,{error:status===503?'PAYPAY_CODE_UNAVAILABLE':code});
      }
    }
    if(paypayPost){
      if(String(request.method||'').toUpperCase()!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
      if(user.admin!==true)return reply(403,{error:'FORBIDDEN'});
      if(typeof postPayPayPayment!=='function')return reply(403,{error:'PAYPAY_POST_DEV_ONLY'});
      try{return reply(200,await postPayPayPayment(operationInput,user));}
      catch(error){
        const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{2,80}$/.test(error.code)?error.code:'PAYPAY_POST_UNAVAILABLE';
        const status=error?.status===400?400:error?.status===403?403:error?.status===409?409:code==='INVALID_PAYPAY_POST_SELECTED'?400:503;
        if(status===503)console.error('[PAYPAY_POST_ERROR]',{code});
        return reply(status,{error:status===503?'PAYPAY_POST_UNAVAILABLE':code});
      }
    }
    if(cashAccept){
      if(String(request.method||'').toUpperCase()!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
      if(user.admin!==true)return reply(403,{error:'FORBIDDEN'});
      if(typeof acceptCashPayment!=='function')return reply(503,{error:'PAYMENT_CASH_ACCEPT_UNAVAILABLE'});
      try{
        const result=await acceptCashPayment(operationInput,user);
        return reply(result?.ok===true?200:500,result?.ok===true?result:{error:'PAYMENT_CASH_ACCEPT_FAILED'});
      }catch(error){
        const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{2,80}$/.test(error.code)
          ?error.code:(typeof error?.message==='string'&&/^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)?error.message:'PAYMENT_CASH_ACCEPT_UNAVAILABLE');
        const known400=new Set(['INVALID_PAYMENT_CASH_ACCEPT_PARAMS','PAYMENT_CASH_MEMBER_GROUP_INVALID','PAYMENT_CASH_RECEPTION_SCOPE_INVALID']);
        const known409=new Set(['PAYMENT_CASH_REQUEST_CONFLICT','PAYMENT_CASH_REQUEST_INCOMPLETE','PAYMENT_CASH_NO_INVOICE','PAYMENT_CASH_NOTHING_DUE','PAYMENT_CASH_EVIDENCE_PENDING']);
        const status=known400.has(code)?400:known409.has(code)?409:code==='PAYMENT_CASH_ACCEPT_FORBIDDEN'?403:code==='PAYMENT_CASH_ACCEPT_UNAUTHENTICATED'?401:503;
        if(status===503)console.error('[PAYMENT_CASH_ACCEPT_ERROR]',{code});
        return reply(status,{error:status===503?'PAYMENT_CASH_ACCEPT_UNAVAILABLE':code});
      }
    }
    if(paymentScreen){
      if(user.admin!==true)return reply(403,{error:'FORBIDDEN'});
      if(!operationInput||Object.keys(operationInput).some(k=>!['action','reception_date','location_id','billing_block_id','target_month','payment_method'].includes(k))||
        !['location_id','billing_block_id'].every(k=>typeof operationInput[k]==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(operationInput[k]))||
        (operationInput.reception_date!==undefined&&(typeof operationInput.reception_date!=='string'||(operationInput.reception_date!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(operationInput.reception_date))))||
        (operationInput.target_month!==undefined&&(typeof operationInput.target_month!=='string'||(operationInput.target_month!==''&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(operationInput.target_month))))||
        (operationInput.payment_method!==undefined&&(typeof operationInput.payment_method!=='string'||operationInput.payment_method.length>64)))return reply(400,{error:'INVALID_PAYMENT_SCREEN_PARAMS'});
      if(typeof readPaymentScreen!=='function')return reply(503,{error:'PAYMENT_SCREEN_READ_UNAVAILABLE'});
      try{return reply(200,await readPaymentScreen(operationInput));}
      catch(error){const code=['RECEPTION_MIGRATION_REQUIRED','RECEPTION_SOURCE_CONFLICT'].includes(error?.message)?error.message:'PAYMENT_SCREEN_READ_UNAVAILABLE';
        return reply(code==='PAYMENT_SCREEN_READ_UNAVAILABLE'?503:409,{error:code});}
    }
    if(receptionSummary){
      if(user.admin!==true)return reply(403,{error:'FORBIDDEN'});
      if(!operationInput||Object.keys(operationInput).some(k=>!['action','reception_date','location_id','billing_block_id'].includes(k))||
        !['location_id','billing_block_id'].every(k=>typeof operationInput[k]==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(operationInput[k]))||
        (operationInput.reception_date!==undefined&&(typeof operationInput.reception_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(operationInput.reception_date))))return reply(400,{error:'INVALID_RECEPTION_PARAMS'});
      if(typeof readPaymentReceptionSummary!=='function')return reply(503,{error:'RECEPTION_READ_UNAVAILABLE'});
      try{return reply(200,await readPaymentReceptionSummary(operationInput));}
      catch(error){const code=['RECEPTION_MIGRATION_REQUIRED','RECEPTION_SOURCE_CONFLICT'].includes(error?.message)?error.message:'RECEPTION_READ_UNAVAILABLE';
        return reply(code==='RECEPTION_READ_UNAVAILABLE'?503:409,{error:code});}
    }
    if(billingMemberInfo){
      if(user.admin!==true)return reply(403,{error:'FORBIDDEN'});
      if(typeof operationInput?.member_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(operationInput.member_id)||
        Object.keys(operationInput).some(key=>!['action','member_id'].includes(key)))return reply(400,{error:'INVALID_BILLING_PARAMS'});
      if(typeof readBillingMemberInfo!=='function')return reply(503,{error:'BILLING_READ_UNAVAILABLE'});
      try{return reply(200,await readBillingMemberInfo(operationInput.member_id));}
      catch{return reply(503,{error:'BILLING_READ_UNAVAILABLE'});}
    }
    if (registration) {
      // Authorize the whole batch before any DAO access or mutation.
      try { validateAttendanceInput(operationInput); }
      catch { return reply(400,{error:'INVALID_ATTENDANCE_INPUT'}); }
      if (user.admin !== true) {
        if (typeof resolveDojoPrincipal !== 'function') return reply(403,{error:'FORBIDDEN'});
        const principal = await resolveDojoPrincipal(user);
        const ownMember = operationInput.attendance_items.every(item=>canAccessMember(principal,item.member_id));
        const ownTeacher = principal?.teacher_id && principal.teacher_id === operationInput.teacher_id;
        if (!ownMember && !ownTeacher) return reply(403,{error:'FORBIDDEN'});
      }
      if (typeof registerAttendanceBatch !== 'function') return reply(503,{error:'ATTENDANCE_WRITE_UNAVAILABLE'});
      try {
        const result = await registerAttendanceBatch(operationInput);
        return reply(result?.ok === true ? 200 : 400,result);
      } catch (error) {
        console.error('[ATTENDANCE_WRITE_ERROR]',{code:/^[A-Z][A-Z0-9_]{2,80}$/.test(error?.message || '') ? error.message : 'UNCLASSIFIED_EXCEPTION'});
        return reply(503,{error:'ATTENDANCE_WRITE_UNAVAILABLE'});
      }
    }
    // Only a verified, server-resolved member can read their own saved attendance.
    // All other operations retain their existing admin-only boundary.
    if (user.admin !== true) {
      if ((!progressSummary && !teacherToday && !attendance && !attendanceSession && !rankOptions && !memberState) || typeof resolveDojoPrincipal !== 'function') return reply(403, { error: 'FORBIDDEN' });
      const principal = await resolveDojoPrincipal(user);
      let teacher=false;
      if(principal?.teacher_id && typeof isActiveTeacher==='function'){
        try{teacher=await isActiveTeacher(principal.teacher_id)===true;}catch{return reply(403,{error:'FORBIDDEN'});}
      }
      if(teacherToday&&!teacher)return reply(403,{error:'FORBIDDEN'});
      if (attendance || memberState || progressSummary) {
        const requestedMember = operation ? operationInput?.member_id : new URL(url, 'http://localhost').searchParams.get('member_id');
        if (!teacher&&!canAccessMember(principal, requestedMember)) return reply(403, { error: 'FORBIDDEN' });
      } else if (rankOptions) {
        if (!teacher&&!principal?.member_id) return reply(403, { error: 'FORBIDDEN' });
      } else if (attendanceSession) {
        // A linked member may see dojo session labels/slots, never arbitrary time-travel queries.
        if ((!teacher&&!principal?.member_id) || operationInput?.at != null) return reply(403, { error: 'FORBIDDEN' });
      }
    }
    if(progressSummary){
      if(typeof operationInput?.member_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(operationInput.member_id)||
        Object.keys(operationInput).some(key=>!['action','member_id'].includes(key)))return reply(400,{error:'INVALID_PROGRESS_PARAMS'});
      if(typeof readAttendanceProgressSummary!=='function')return reply(503,{error:'PROGRESS_UNAVAILABLE'});
      try{const result=await readAttendanceProgressSummary(operationInput.member_id);return reply(result?.ok===true?200:400,result);}
      catch{return reply(503,{error:'PROGRESS_UNAVAILABLE'});}
    }
    if(teacherToday){
      const allowed=['action','location_id','billing_block_id','attendance_date'];
      if(!operationInput || Object.keys(operationInput).some(k=>!allowed.includes(k)) || typeof operationInput.location_id!=='string' || !operationInput.location_id ||
        ['billing_block_id','attendance_date'].some(k=>operationInput[k]!=null&&(typeof operationInput[k]!=='string'||!operationInput[k])))return reply(400,{error:'INVALID_TEACHER_SCOPE'});
      if(typeof readTeacherAttendanceToday!=='function')return reply(503,{error:'TEACHER_OVERVIEW_UNAVAILABLE'});
      try{const result=await readTeacherAttendanceToday(operationInput);return reply(result?.ok===true?200:400,result);}
      catch{return reply(503,{error:'TEACHER_OVERVIEW_UNAVAILABLE'});}
    }
    if (memberState) {
      const keys = ['member_id', 'location_id', 'billing_block_id', 'attendance_date'];
      if (!operation || !operationInput || keys.some(key => typeof operationInput[key] !== 'string' || !operationInput[key].trim()) ||
          Object.keys(operationInput).some(key => !keys.includes(key))) return reply(400, { error:'INVALID_MEMBER_STATE_PARAMS' });
      if (typeof readMemberAttendanceState !== 'function') return reply(503, { error:'MEMBER_STATE_UNAVAILABLE' });
      try {
        const result = await readMemberAttendanceState(operationInput);
        return reply(result?.ok === true ? 200 : 400, result);
      } catch (error) {
        // Keep diagnostics server-side; never expose DAO details to the client.
        const code = typeof error?.message === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)
          ? error.message : 'UNCLASSIFIED_EXCEPTION';
        if (error?.firestoreQueryCapture) {
          console.error('[FIRESTORE_QUERY_CAPTURE] ' + JSON.stringify(error.firestoreQueryCapture));
        }
        console.error('[MEMBER_STATE_ERROR]', {
          code, name: error?.name || 'Error',
          ...(error?.firestoreOperation === 'runQuery' ? {
            operation: 'runQuery',
            collection: /^[a-z_]{1,64}$/.test(error.firestoreCollection || '') ? error.firestoreCollection : 'UNKNOWN',
            firestoreStatus: /^[A-Z_]{3,40}$/.test(error.firestoreStatus || '') ? error.firestoreStatus : 'UNKNOWN',
            firestoreReason: ['INDEX_REQUIRED','INVALID_QUERY','OTHER'].includes(error.firestoreReason) ? error.firestoreReason : 'OTHER'
          } : {})
        });
        return reply(503, { error:'MEMBER_STATE_UNAVAILABLE' });
      }
    }
    if (rankOptions) {
      if (operationInput && Object.keys(operationInput).some(key => key !== 'action')) return reply(400, { error: 'INVALID_RANK_OPTIONS_PARAMS' });
      if (typeof readAttendanceRankOptions !== 'function') return reply(503, { error: 'RANK_OPTIONS_UNAVAILABLE' });
      try { return reply(200, await readAttendanceRankOptions()); }
      catch { return reply(503, { error: 'RANK_OPTIONS_UNAVAILABLE' }); }
    }
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
