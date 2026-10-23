#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {createFirestoreProgressReader} = require('../cloud/attendance/progress-firestore.cjs');

const ROOT = path.resolve(__dirname, '..');
const PROFILE_PATH = path.join(ROOT, 'targets', 'dev-firebase.json');
const OUTPUT_DIR = path.join(__dirname, 'paper-attendance-dev-snapshots');
const PROJECT_ID = 'dojo-management-dev';
const TEST_MEMBER_ID = 'ITER11C2_MEMBER_20261023';
const PAPER_LOCATION = 'PAPER_UNKNOWN_LOCATION';
const PAPER_BLOCK = 'PAPER_UNKNOWN_BILLING_BLOCK';
const PAPER_SLOTS = Object.freeze(Array.from({length: 8}, (_, i) => `PAPER_UNKNOWN_SLOT_${i + 1}`));
const BILLING_COLLECTIONS = Object.freeze([
  'monthly_selections', 'invoices', 'payments', 'paymentEvidences', 'payment_status_views'
]);
const ACTIVE = new Set(['', '有効', '在籍', 'TRUE']);

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}
function text(value) { return String(value ?? '').trim(); }
function validateDate(value) {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) fail('INVALID_DATE');
  return date;
}
function validateMember(value) {
  if (text(value) !== TEST_MEMBER_ID) fail('DEV_TEST_MEMBER_REQUIRED');
  return TEST_MEMBER_ID;
}
function validateProfile(profile) {
  if (profile?.target !== 'dev-firebase' || profile?.runtime !== 'firebase' ||
      profile?.mode !== 'development' || profile?.projectId !== PROJECT_ID ||
      profile?.confirmedDevelopmentProject !== PROJECT_ID) fail('DEV_PROFILE_REQUIRED');
  return profile;
}
function assertNoEmulator(env = process.env) {
  if (text(env.FIRESTORE_EMULATOR_HOST)) fail('FIRESTORE_EMULATOR_FORBIDDEN');
}
function active(row) { return ACTIVE.has(text(row?.['状態'])); }
function minutes(row) {
  const value = row?.['稽古時間分'];
  if (value == null || text(value) === '') return 60;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) fail('INVALID_ATTENDANCE_DURATION', text(row?.__id));
  return n;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function pick(row, fields) {
  const out = {id: text(row?.__id)};
  for (const field of fields) if (row?.[field] !== undefined) out[field] = row[field];
  return stable(out);
}
function sanitizeAttendance(row) {
  return pick(row, ['attendance_id','member_id','稽古日','稽古時間分','状態','slot_id','location_id',
    'billing_block_id','target_month','attendance_session_id','source','request_id','created_at','updated_at']);
}
const BILLING_FIELDS = Object.freeze({
  monthly_selections:['member_id','billing_group_id','target_month','plan_id','selected','status','updated_at'],
  invoices:['invoice_id','member_id','billing_group_id','target_month','plan_id','請求予定額','金額','上限金額','支払状態','status','updated_at'],
  payments:['payment_id','member_id','billing_group_id','target_month','invoice_id','入金額','支払方法','決済ID','status','request_id','updated_at'],
  paymentEvidences:['evidence_id','member_id','billing_group_id','invoice_id','amount','payment_method','status','request_id','payment_log_id','updated_at'],
  payment_status_views:['member_id','billing_group_id','target_month','status','billed_total','paid_total','unpaid_amount','updated_at']
});
function sanitizeBilling(collection, rows, month) {
  return rows.filter(row => !row.target_month || row.target_month === month)
    .map(row => pick(row, BILLING_FIELDS[collection])).sort((a,b) => a.id.localeCompare(b.id));
}
function buildSnapshot({member, attendanceRows = [], progress = null, billing = {}, generatedAt}, {memberId, date}) {
  validateMember(memberId); validateDate(date);
  const month = date.slice(0, 7);
  const targetRows = attendanceRows.filter(row => text(row.member_id) === memberId && text(row['稽古日']) === date);
  const paper = targetRows.filter(row => PAPER_SLOTS.includes(text(row.slot_id)) &&
    text(row.location_id) === PAPER_LOCATION && text(row.billing_block_id) === PAPER_BLOCK);
  const activePaper = paper.filter(active);
  const cancelled = targetRows.filter(row => !active(row));
  const normal = targetRows.filter(row => !paper.includes(row));
  const attendanceByDate = Array.isArray(progress?.attendance_by_date) ? progress.attendance_by_date : [];
  const targetProgress = attendanceByDate.find(row => row.attendance_date === date) || null;
  const billingResult = {};
  for (const collection of BILLING_COLLECTIONS) billingResult[collection] = sanitizeBilling(collection, billing[collection] || [], month);
  return stable({
    schema_version: 1,
    generated_at: generatedAt || new Date().toISOString(),
    complete: true,
    project_id: PROJECT_ID,
    member: {member_id: memberId, exists: Boolean(member), status: member ? text(member.status) : ''},
    target: {attendance_date: date, target_month: month, location_id:PAPER_LOCATION,
      billing_block_id:PAPER_BLOCK, slot_ids:[...PAPER_SLOTS]},
    attendance: {
      records: targetRows.map(sanitizeAttendance).sort((a,b)=>a.id.localeCompare(b.id)),
      paper_active: activePaper.map(sanitizeAttendance).sort((a,b)=>a.id.localeCompare(b.id)),
      paper_cancelled: paper.filter(row=>!active(row)).map(sanitizeAttendance).sort((a,b)=>a.id.localeCompare(b.id)),
      normal_qr: normal.map(sanitizeAttendance).sort((a,b)=>a.id.localeCompare(b.id)),
      cancelled: cancelled.map(sanitizeAttendance).sort((a,b)=>a.id.localeCompare(b.id)),
      paper_active_slot_count: activePaper.length,
      paper_active_minutes: activePaper.reduce((sum,row)=>sum+minutes(row),0),
      target_date_confirmed_minutes: targetRows.filter(active).reduce((sum,row)=>sum+minutes(row),0)
    },
    progress_summary: progress?.ok === true ? {
      member_id: memberId,
      training_count: progress.training_count,
      training_days: progress.training_days,
      attendance_by_date: attendanceByDate,
      target_date: targetProgress
    } : {member_id:memberId, available:false, reason:member ? 'PROGRESS_UNAVAILABLE':'TEST_MEMBER_NOT_CREATED'},
    billing: billingResult
  });
}
function compareSnapshots(before, after) {
  for (const value of [before,after]) {
    if (!value?.complete || value.project_id !== PROJECT_ID || value.member?.member_id !== TEST_MEMBER_ID)
      fail('INCOMPLETE_OR_FOREIGN_SNAPSHOT');
  }
  if (JSON.stringify(before.target) !== JSON.stringify(after.target)) fail('SNAPSHOT_TARGET_MISMATCH');
  const changes = {
    paper_active_slot_count:[before.attendance.paper_active_slot_count,after.attendance.paper_active_slot_count],
    paper_active_minutes:[before.attendance.paper_active_minutes,after.attendance.paper_active_minutes],
    target_date_confirmed_minutes:[before.attendance.target_date_confirmed_minutes,after.attendance.target_date_confirmed_minutes],
    cancelled:[before.attendance.cancelled,after.attendance.cancelled],
    normal_qr:[before.attendance.normal_qr,after.attendance.normal_qr],
    billing:Object.fromEntries(BILLING_COLLECTIONS.map(name=>[name,[before.billing[name],after.billing[name]]]))
  };
  const anomalies = [];
  if (JSON.stringify(changes.normal_qr[0]) !== JSON.stringify(changes.normal_qr[1])) anomalies.push('NORMAL_QR_ATTENDANCE_CHANGED');
  for (const name of BILLING_COLLECTIONS)
    if (JSON.stringify(changes.billing[name][0]) !== JSON.stringify(changes.billing[name][1])) anomalies.push(`BILLING_CHANGED:${name}`);
  return {ok:anomalies.length===0, anomalies, changes};
}
function outputPath(file) {
  if (!/^[A-Za-z0-9_.-]+\.json$/.test(text(file))) fail('INVALID_OUTPUT_FILENAME');
  return path.join(OUTPUT_DIR, file);
}
function parseArgs(argv) {
  const [command,...rest]=argv; const options={};
  for(let i=0;i<rest.length;i+=2){if(!/^--/.test(rest[i])||rest[i+1]==null)fail('INVALID_ARGUMENTS');options[rest[i].slice(2)]=rest[i+1];}
  return {command,options};
}
function createReadOnlyCore(db) {
  const {FieldPath}=require('firebase-admin/firestore');
  const row = doc => doc.exists ? {...doc.data(),__id:doc.id} : null;
  return Object.freeze({
    readById: async(source,id)=>row(await db.collection(source.collection).doc(id).get()),
    queryEqual: async(source,filters,{limit=500}={})=>{
      let query=db.collection(source.collection);for(const filter of filters)query=query.where(filter.field,'==',filter.value);
      const snap=await query.limit(limit).get();return snap.docs.map(doc=>({...doc.data(),__id:doc.id}));
    },
    readPage: async(source,{pageSize=100,pageToken=null}={})=>{
      let query=db.collection(source.collection).orderBy(FieldPath.documentId()).limit(pageSize);
      if(pageToken)query=query.startAfter(pageToken);
      const snap=await query.get();const documents=snap.docs.map(doc=>({id:doc.id,fields:doc.data()}));
      return {documents,nextPageToken:snap.docs.length===pageSize?snap.docs.at(-1).id:null};
    }
  });
}
async function readMemberRows(db, collection, memberId) {
  const snap=await db.collection(collection).where('member_id','==',memberId).limit(500).get();
  if(snap.docs.length>=500)fail('READ_INCOMPLETE',collection);
  return snap.docs.map(doc=>({...doc.data(),__id:doc.id}));
}
async function readLive(options) {
  assertNoEmulator();
  const profile=validateProfile(JSON.parse(fs.readFileSync(PROFILE_PATH,'utf8')));
  const memberId=validateMember(options['member-id']);const date=validateDate(options.date);
  const {initializeApp,applicationDefault,getApps}=require('firebase-admin/app');
  const {getFirestore}=require('firebase-admin/firestore');
  const app=getApps()[0]||initializeApp({credential:applicationDefault(),projectId:profile.projectId});
  const db=getFirestore(app);const core=createReadOnlyCore(db);
  const member=await core.readById({collection:'members'},memberId);
  const attendanceRows=await readMemberRows(db,'attendances',memberId);
  let progress=null;if(member)progress=await createFirestoreProgressReader(core)(memberId);
  const billing={};for(const name of BILLING_COLLECTIONS)billing[name]=await readMemberRows(db,name,memberId);
  return buildSnapshot({member,attendanceRows,progress,billing},{memberId,date});
}
async function main(argv=process.argv.slice(2)) {
  const {command,options}=parseArgs(argv);
  if(command==='snapshot'){
    const snapshot=await readLive(options);const destination=outputPath(options.output);
    fs.mkdirSync(OUTPUT_DIR,{recursive:true});fs.writeFileSync(destination,JSON.stringify(snapshot,null,2)+'\n','utf8');
    console.log(JSON.stringify({ok:true,output:path.relative(ROOT,destination),member_exists:snapshot.member.exists,
      state:snapshot.member.exists?'SNAPSHOT_COMPLETE':'TEST_MEMBER_NOT_CREATED'},null,2));return;
  }
  if(command==='compare'){
    const before=JSON.parse(fs.readFileSync(outputPath(options.before),'utf8'));
    const after=JSON.parse(fs.readFileSync(outputPath(options.after),'utf8'));
    const result=compareSnapshots(before,after);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;return;
  }
  fail('USAGE','snapshot --member-id ID --date YYYY-MM-DD --output FILE.json | compare --before FILE.json --after FILE.json');
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.code||'SNAPSHOT_FAILED',message:error.message}));process.exitCode=1;});
module.exports={PROJECT_ID,TEST_MEMBER_ID,PAPER_SLOTS,BILLING_COLLECTIONS,validateProfile,validateMember,validateDate,
  assertNoEmulator,buildSnapshot,compareSnapshots,outputPath,createReadOnlyCore};
