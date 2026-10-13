'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {createSessionInfo} = require('../cloud/attendance/session-info.cjs');

// Run the actual GAS source, replacing only SpreadsheetApp/Apps Script infrastructure.
const source = fs.readFileSync(path.join(__dirname, '../gas/04_Attendance.js'), 'utf8');
const zone = 'Asia/Tokyo';
function formatDate(date, format) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone:zone, weekday:'short', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(date).map(p=>[p.type,p.value]));
  if (format === 'HH:mm') return `${parts.hour}:${parts.minute}`;
  if (format === 'u') return String(({Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7})[parts.weekday]);
  throw new Error(`Unexpected GAS date format: ${format}`);
}
const sandbox = {
  ensureSheetContext: ctx => ctx,
  getLocations: ctx => ctx.locations,
  getBillingBlocks: ctx => ctx.billingBlocks,
  getTrainingSlots: ctx => ctx.trainingSlots,
  sup_now: () => new Date('2026-10-13T10:30:00+09:00'),
  Session: {getScriptTimeZone: () => zone},
  Utilities: {formatDate: (date, _zone, format) => formatDate(date, format)}
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, {filename:'gas/04_Attendance.js'});
const base = {
  location:{location_id:'L001','表示名':'本部'},
  billingBlocks:[
    {location_id:'L001',billing_block_id:'B1','曜日':'火曜日','表示名':'一般','1課金あたり枠数':2},
    {location_id:'L001',billing_block_id:'B2','曜日':'火曜日','表示名':'夜間'}
  ],
  trainingSlots:[
    {location_id:'L001',billing_block_id:'B1',slot_id:'S1','開始時刻':'10:00','終了時刻':'11:00'},
    {location_id:'L001',billing_block_id:'B2',slot_id:'S2','開始時刻':'18:00','終了時刻':'19:00'}
  ]
};
async function compare(name, input, data=base) {
  await test(name, async () => {
    const ctx={locations:data.location?[data.location]:[],billingBlocks:data.billingBlocks,trainingSlots:data.trainingSlots};
    const gas = sandbox.getAttendanceSessionInfo(input,ctx);
    const firebase = await createSessionInfo({readSessionMasters:async()=>data})(input);
    // Cross-realm objects returned by vm have distinct prototypes; compare JSON wire payloads.
    assert.deepEqual(JSON.parse(JSON.stringify(firebase)),JSON.parse(JSON.stringify(gas)));
  });
}
(async()=>{
  await compare('GAS/Firebase: exact active slot', {location_id:'L001',at:'2026-10-13T10:30:00+09:00'});
  await compare('GAS/Firebase: 30 minutes before slot', {location_id:'L001',at:'2026-10-13T09:30:00+09:00'});
  await compare('GAS/Firebase: outside schedule requires selection', {location_id:'L001',at:'2026-10-13T15:00:00+09:00'});
  await compare('GAS/Firebase: explicit billing block', {location_id:'L001',billing_block_id:'B2',at:'2026-10-13T15:00:00+09:00'});
  await compare('GAS/Firebase: unknown location', {location_id:'missing',at:'2026-10-13T10:30:00+09:00'}, {...base,location:null});
  await compare('GAS/Firebase: inactive billing block', {location_id:'L001',billing_block_id:'B1',at:'2026-10-13T10:30:00+09:00'}, {...base,billingBlocks:base.billingBlocks.map(b=>({...b,'状態':'無効'}))});
  await compare('GAS/Firebase: no training slots', {location_id:'L001',billing_block_id:'B1',at:'2026-10-13T10:30:00+09:00'}, {...base,trainingSlots:[]});
})().catch(e=>{console.error(e);process.exitCode=1;});
