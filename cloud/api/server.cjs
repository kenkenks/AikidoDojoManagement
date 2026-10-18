'use strict';
// Canonical GAS date constructors use the dojo script's timezone.
process.env.TZ = 'Asia/Tokyo';

if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('AUTH_EMULATOR_NOT_ALLOWED');
}

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const {getFirestore,FieldValue} = require('firebase-admin/firestore');
const {createAttendanceCore} = require('../../adapters/firestore/DAO_Core.js');
const { createServer } = require('node:http');
const { createDao } = require('../../shared/DAO_Business.js');
const { createFirestoreCore } = require('../member-read/DAO_Core_Firestore.cjs');
const { createAdminApi } = require('./admin-api.cjs');
const { createFirestoreDojoPrincipalResolver } = require('./dojo-account-firestore.cjs');
const { createDispatch } = require('./webConnect.cjs');
const { createQrGeneratorOptions } = require('../qr/generator-options.cjs');
const { createAttendanceRankOptions } = require('../attendance/rank-options.cjs');
const { createSessionMasterReader } = require('../attendance/session-masters.cjs');
const {createTeacherTodayReader}=require('../attendance/teacher-today-firestore.cjs');
const { createSystemSessionInfo } = require('../attendance/session-info.cjs');
const { createAttendanceSavedState } = require('../attendance/saved-state.cjs');
const { createFirestoreMemberAttendanceState } = require('../attendance/member-state-firestore.cjs');
const { createFirestoreProgressReader } = require('../attendance/progress-firestore.cjs');
const { createBillingMemberInfoReader } = require('../billing/member-info-firestore.cjs');
const {createReceptionSummaryReader}=require('../billing/reception-summary-firestore.cjs');
const {createPaymentScreenReader}=require('../billing/payment-screen-firestore.cjs');
const {createPaymentCashAcceptCommand}=require('../billing/payment-cash-accept-command.cjs');
const {createPayPayPostFirestoreExecutor}=require('../billing/payment-paypay-post-firestore.cjs');
const {createPayPayCodeFirestoreExecutor}=require('../billing/payment-paypay-code-firestore.cjs');
const {validatePayPayPostSelected,validatePayPayCodeStart,validatePayPayCodeRecordBatch}=require('../billing/payment-paypay-command.cjs');
const {createPaymentCashAcceptFirestoreExecutor}=require('../billing/payment-cash-accept-firestore.cjs');
const { createTimeTravelTarget, createAttendanceRegistrationTarget,createTeacherOverviewTarget } = require('../time-travel/target.cjs');

const root = path.resolve(__dirname, '..', '..');
const port = Number(process.env.PORT || 8082);
const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
const profile = JSON.parse(
  fs.readFileSync(path.join(root, 'targets', 'dev-firebase.json'), 'utf8')
);

const credential = applicationDefault();
const firebaseApp = initializeApp({
  projectId: profile.projectId,
  credential
});

const application = createTimeTravelTarget({
  projectId: profile.projectId,
  mode: profile.mode,
  confirmedDevelopmentProject: profile.confirmedDevelopmentProject
}, {
  getAccessToken: async () => (await credential.getAccessToken()).access_token
});

const allowedOrigins = new Set([
  'https://dojo-management-dev.web.app',
  'https://dojo-management-dev.firebaseapp.com'
]);

function getCorsHeaders(origin) {
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin'
  };
}

const memberCore = createFirestoreCore(profile, {
  getAccessToken: async () => (await credential.getAccessToken()).access_token
});
const memberDao = createDao(memberCore, 'firestore');
const attendanceCore = createAttendanceCore(getFirestore(firebaseApp),{
  createRegistration:createAttendanceRegistrationTarget
});
const paymentCashExecutor=createPaymentCashAcceptFirestoreExecutor(getFirestore(firebaseApp),{
  getSystemContext:()=>application.getSystemContext(),
  createProjection:()=>createAttendanceRegistrationTarget({daoCore:{},timezone:'Asia/Tokyo',cache:{}},{uuid:()=>{throw Error('UUID_FORBIDDEN');}}),
  serverTimestamp:()=>FieldValue.serverTimestamp()
});
const paymentCashCommand=createPaymentCashAcceptCommand({executeAtomic:paymentCashExecutor});
const paypayDevOnly=profile.mode==='development' && profile.projectId==='dojo-management-dev' && profile.confirmedDevelopmentProject==='dojo-management-dev';
const paymentPayPayExecutor=paypayDevOnly?createPayPayPostFirestoreExecutor(getFirestore(firebaseApp),{
  getSystemContext:()=>application.getSystemContext(),
  createProjection:()=>createAttendanceRegistrationTarget({daoCore:{},timezone:'Asia/Tokyo',cache:{}},{uuid:()=>{throw Error('UUID_FORBIDDEN');}}),
  serverTimestamp:()=>FieldValue.serverTimestamp()
}):null;
const postPayPayPayment=paymentPayPayExecutor?((input,user)=>paymentPayPayExecutor({
  request:validatePayPayPostSelected(input),
  actor:{authenticated_uid:user.uid,receptionist_id:user.uid,receptionist_type:'ADMIN',teacher_id:''}
})):null;
const billingMemberReader=createBillingMemberInfoReader(getFirestore(firebaseApp),{
  getSystemContext:()=>application.getSystemContext(),createProjection:createAttendanceRegistrationTarget
});
const paypayCodeExecutor=paypayDevOnly?createPayPayCodeFirestoreExecutor(getFirestore(firebaseApp),{
  getSystemContext:()=>application.getSystemContext(),
  createProjection:()=>createAttendanceRegistrationTarget({daoCore:{},timezone:'Asia/Tokyo',cache:{}},{uuid:()=>{throw Error('UUID_FORBIDDEN');}}),
  serverTimestamp:()=>FieldValue.serverTimestamp()
}):null;
const startPayPayCode=paypayCodeExecutor?async(input,user)=>{
  const request=validatePayPayCodeStart(input);
  const paymentInfo=await billingMemberReader(request.member_id);
  return paypayCodeExecutor.start({request,paymentInfo,actor:{authenticated_uid:user.uid,admin:user.admin===true}});
}:null;
const recordPayPayCode=paypayCodeExecutor?((input,user)=>paypayCodeExecutor.record({
  request:validatePayPayCodeRecordBatch(input),actor:{authenticated_uid:user.uid,admin:user.admin===true}
})):null;

const readAttendanceSavedState = createAttendanceSavedState({
  memberDao,
  attendanceDao: { queryEqual: (source, filters) => memberCore.queryEqual(source, filters) }
});

const readSessionMasters = createSessionMasterReader({
    masterDao: {
      readById: (source, id) => memberCore.readById(source, id),
      queryEqual: (source, filters) => memberCore.queryEqual(source, filters)
    }
  });
const readAttendanceSessionInfo = createSystemSessionInfo({readSessionMasters,
  getSystemContext:()=>application.getSystemContext()});
const readMemberAttendanceState = createFirestoreMemberAttendanceState(memberCore, {
  getTargetMonth: async () => {
    const context = await application.getSystemContext();
    if (!context || context.ok !== true || !/^\d{4}-(0[1-9]|1[0-2])$/.test(context.target_month || ''))
      throw new Error('SYSTEM_CONTEXT_UNAVAILABLE');
    return context.target_month;
  },
  validateScope: async (locationId, blockId) => {
    const masters = await readSessionMasters(locationId);
    const active = row => ['', '有効', '在籍', 'TRUE'].includes(String(row?.['状態'] ?? '').trim());
    if (!masters.location || !active(masters.location) ||
        !masters.billingBlocks.some(row => row.billing_block_id === blockId && row.location_id === locationId && active(row)))
      throw new Error('INVALID_MEMBER_STATE_SCOPE');
  }
});

const handle = createAdminApi({
  readPaymentScreen:createPaymentScreenReader(getFirestore(firebaseApp),{
    getSystemContext:()=>application.getSystemContext(),createProjection:createAttendanceRegistrationTarget
  }),
  acceptCashPayment:(input,user)=>paymentCashCommand.execute(input,user),
  postPayPayPayment,
  startPayPayCode,
  recordPayPayCode,
  readPaymentReceptionSummary:createReceptionSummaryReader(getFirestore(firebaseApp),{
    getSystemContext:()=>application.getSystemContext(),createProjection:createAttendanceRegistrationTarget
  }),
  readBillingMemberInfo: billingMemberReader,
  readAttendanceProgressSummary: createFirestoreProgressReader(memberCore),
  isActiveTeacher:async id=>{
    const row=await memberCore.readById({collection:'teachers'},id);
    return !!row&&['','有効','在籍','TRUE'].includes(String(row.status??'').trim())&&(!row.teacher_id||row.teacher_id===id);
  },
  readTeacherAttendanceToday:createTeacherTodayReader(memberCore,{
    getSystemContext:()=>application.getSystemContext(),
    createOverview:createTeacherOverviewTarget
  }),
  verifyIdToken: (token, revoked) => getAuth(firebaseApp).verifyIdToken(token, revoked),
  getTimeTravel: () => application.getTimeTravel(),
  getSystemContext: () => application.getSystemContext(),
  saveTimeTravel: input => application.saveTimeTravel(input),
  readMember: id => memberDao.readById('members', id),
  readMembers: ids => memberDao.readByIds('members', ids),
  readAttendanceSavedState,
  registerAttendanceBatch: input => attendanceCore.register(input),
  readMemberAttendanceState,
  readAttendanceRankOptions: createAttendanceRankOptions({ masterDao: { readPage: (...args) => memberCore.readPage(...args) } }),
  resolveDojoPrincipal: createFirestoreDojoPrincipalResolver(memberCore),
  readAttendanceSessionInfo,
  readQrGeneratorOptions: createQrGeneratorOptions({ masterDao: { readPage: (...args) => memberCore.readPage(...args) } })
});

const dispatch = createDispatch(handle);

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

createServer(async (req, res) => {
  try {
    const corsHeaders = getCorsHeaders(req.headers.origin);

    if (req.method === 'OPTIONS') {
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) {
        res.writeHead(403, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED' }));
        return;
      }
      res.writeHead(204, {
        ...corsHeaders,
        'Cache-Control': 'no-store'
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/hello') {
      res.writeHead(200, {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({ ok: true, service: 'dojo-api' }));
      return;
    }

    let body = null;
    if (req.method === 'POST') {
      try {
        body = await readJsonBody(req);
      } catch {
        res.writeHead(400, {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: 'INVALID_JSON' }));
        return;
      }
    }

    // Shared WebConnect transport entry; authentication is enforced by existing handlers.
    const parsed = new URL(req.url, 'http://localhost');
    if (parsed.pathname === '/api/webconnect') {
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
        return;
      }
      const action = req.method === 'GET' ? parsed.searchParams.get('action') : body && body.action;
      const input = req.method === 'GET' ? Object.fromEntries(parsed.searchParams) : body && body.input;
      // The transport method cannot be used to invoke a different operation's method.
      const readActions = new Set(['system_context', 'time_travel_admin', 'attendance_saved_state', 'attendance_session_info', 'attendance_rank_options', 'member_attendance_state', 'member_read', 'qr_generator_options','teacher_attendance_today','attendance_progress_summary','getMemberInfo','payment_reception_summary','payment_screen_read']);
      const writeActions = new Set(['time_travel_set', 'members_read', 'attendance_batch','payment_cash_accept','payment_paypay_post_selected','paypay_code_start','paypay_code_record']);
      if ((req.method === 'GET' && writeActions.has(action)) ||
          (req.method === 'POST' && readActions.has(action))) {
        res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
        return;
      }
      const result = await dispatch({ action, input, method:req.method, context: {
        authorization: req.headers.authorization
      } });
      res.writeHead(result.status, { ...result.headers, ...corsHeaders });
      res.end(JSON.stringify(result.body));
      return;
    }

    const result = await handle({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body
    });

    res.writeHead(result.status, { ...result.headers, ...corsHeaders });
    res.end(JSON.stringify(result.body));
  } catch (error) {
    console.error(error?.stack || error);
    res.writeHead(500, {
      ...getCorsHeaders(req.headers.origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ error: 'INTERNAL_ERROR' }));
  }
}).listen(port, host, () => {
  console.log(`Dojo API: http://${host}:${port}`);
  console.log(`Firebase project: ${profile.projectId}`);
});
