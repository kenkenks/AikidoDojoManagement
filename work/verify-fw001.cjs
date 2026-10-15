'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=[
  'verify-fw001-registration.cjs','verify-fw001-browser.cjs','verify-fw001-firestore-safety.test.cjs',
  'verify-attendance-core-regression.cjs','verify-attendance.mjs',
  'verify-attendance-progress.mjs','verify-attendance-schema-contract.cjs',
  'verify-attendance-saved-state.cjs','verify-attendance-session-masters-step6c.cjs',
  'verify-attendance-session-info-step6c2.cjs','verify-attendance-session-parity-step7b.cjs',
  'verify-attendance-master-runtime-step8i.cjs','verify-attendance-step8i-ranks.cjs',
  'verify-attendance-step8i-progress.cjs','verify-attendance-step8i-progress-firestore.cjs',
  'verify-attendance-step8i-member-state.cjs','verify-attendance-step8i-member-firestore.cjs',
  'verify-attendance-step8i-member-webconnect.cjs','verify-attendance-step8i-billing.cjs',
  'verify-attendance-step8i-billing-firestore.cjs','verify-attendance-step8i-monthly-read.cjs',
  'verify-attendance-step8i-monthly-key.cjs','verify-attendance-step8i-monthly-schema.cjs',
  'verify-attendance-step8g-webconnect.cjs','verify-attendance-step8h-browser.cjs',
  'verify-webconnect-http-step7c.cjs','verify-attendance-step8c-principal.cjs',
  'verify-attendance-step8f-transaction.cjs','verify-time-travel-firestore-composition.cjs',
  'verify-time-travel-entry.cjs','verify-view-definition-attendance.mjs'
];
const result=spawnSync(process.execPath,['--test',...files.map(name=>'work/'+name)],{
  cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,TZ:'Asia/Tokyo'}
});
if(result.error)throw result.error;
process.exitCode=result.status;
