'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
cp.execFileSync(process.execPath,[path.join(root,'tools','build-portable-dao-payment-gas-runtime.mjs')],{cwd:root,stdio:'ignore'});
const rows=[
 ['evidence_id','invoice_id','member_id','payment_method','amount','reception_date','status','evidence_code','requested_at','confirmed_at','confirmed_by','posted_at','payment_log_id','remarks'],
 ['EV-5A','INV-1','M001','PAYPAY',1500,'2099-07-10','REQUESTED','','REQ','','','','','KEEP']
];
const sheet={
 getDataRange(){return {getValues(){return rows.map(r=>r.slice());}};},
 getLastRow(){return rows.length;},
 getRange(r,c,nr=1,nc=1){return {
   setValue(v){rows[r-1][c-1]=v;return this;}, setNumberFormat(){return this;},
   setValues(values){for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)rows[r-1+i][c-1+j]=values[i][j];return this;},
   getValues(){return rows.slice(r-1,r-1+nr).map(row=>row.slice(c-1,c-1+nc));}
 };}
};
const sandbox={globalThis:null,module:{exports:{}},exports:{},console,SpreadsheetApp:{getActiveSpreadsheet(){return {getSheetByName(n){return n==='09_決済エビデンス'?sheet:null;}};}}};
sandbox.globalThis=sandbox;
vm.runInNewContext(fs.readFileSync(path.join(root,'gas','DojoPortableDaoPayment.js'),'utf8'),sandbox);
const api=sandbox.module.exports;
const dao=api.create({}, {spreadsheet:{getSheetByName(n){return n==='09_決済エビデンス'?sheet:null;}}});
const before=dao.readById('paymentEvidence','EV-5A');
assert.equal(before.status,'REQUESTED'); assert.equal(before.remarks,'KEEP');
assert.equal(dao.updateByKey('paymentEvidence','EV-5A',{status:'CONFIRMED',evidence_code:'CODE'}).found,true);
const after=dao.readById('paymentEvidence','EV-5A');
assert.equal(after.status,'CONFIRMED'); assert.equal(after.evidence_code,'CODE'); assert.equal(after.invoice_id,'INV-1'); assert.equal(after.remarks,'KEEP');
assert.equal(dao.updateByKey('paymentEvidence','MISSING',{status:'POSTED'}).found,false);
assert.equal(rows.length,2);
console.log('PAYMENT-EVIDENCE-STEP5A LOCAL VERIFY PASS');
