const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const path = require('path');
const base=path.resolve(process.argv[2] || 'work/baseline/gas')+path.sep;
const next=path.resolve(process.argv[3] || 'work/source/AikidoDojoManagement-main/gas')+path.sep;
function run(root, data, action, separate=false) {
  const trace=[];
  function sheet(rows,label) { return {
    getDataRange(){trace.push([label,'read']);return {getValues:()=>structuredClone(rows)}},
    getLastColumn(){return rows[0]?.length||0},
    getRange(r,c,h,w){return {getValues:()=>[rows[r-1].slice(c-1,c-1+w)],setValues(v){trace.push([label,'write',r,c,v]);v.forEach((row,i)=>row.forEach((x,j)=>{rows[r-1+i]??=[];rows[r-1+i][c-1+j]=x}))}}},
    appendRow(row){trace.push([label,'append',row]);rows.push(row)}
  }}
  const rows=structuredClone(data), active=separate?structuredClone(data):rows;
  const s=sheet(rows,'context'), a=separate?sheet(active,'active'):s;
  const ctx={ss:{getSheetByName:()=>s}};
  const sandbox={console:{log(){}},normalizeId_:v=>String(v||'').trim(),normalizeMonth:v=>String(v||'').trim(),ensureSheetContext:v=>v||ctx,getRequiredSheet_:()=>s,SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>a})}};
  vm.createContext(sandbox);
  for(const f of ['viewUtils.js','DAO_Core_Sheets.js','DAO_Composition.js','DAO_Business_View.js','20_PaymentStatusView.js']) if(fs.existsSync(root+f))vm.runInContext(fs.readFileSync(root+f,'utf8'),sandbox);
  let result,error;
  try {result=action(sandbox,ctx)}catch(e){error=e.message}
  return JSON.parse(JSON.stringify({result,error,rows,active,trace}));
}
let count=0;
function compare(data,action,separate=false){assert.deepEqual(run(next,data,action,separate),run(base,data,action,separate));count++}
const headers=['target_month','member_id','details','other'];
for(const value of ['[{"id":1}]','bad','{}','',null])compare([headers,['2026-09',' M1 ',value,'keep']],(s,c)=>s.paymentStatusView_readDetailItems_('M1','2026-09','details',c));
for(const data of [[],[headers],[['member_id'],['M1']],[headers,['2026-09','M2','[]','']]])compare(data,(s,c)=>s.paymentStatusView_readDetailItems_('M1','2026-09','details',c));
for(const separate of [false,true])for(const member of ['M1','M2'])compare([headers,['2026-09','M1','[]','keep'],['2026-09','M1','[]','duplicate']],(s,c)=>s.paymentStatusView_update(member,'2026-09',{details:'[1]'},c),separate);
for(const data of [[],[headers],[[' member_id ','target_month']]])compare(data,(s,c)=>s.paymentStatusView_ensureViewHeaders_({details:'',new_field:0},c));
compare([headers,['2026-09','M1','[]','keep']],(s,c)=>s.paymentStatusView_update('M1','2026-09',{new_field:1},c));
compare([['details']],(s,c)=>s.paymentStatusView_update('M1','2026-09',{details:1},c));
const sandbox={};vm.createContext(sandbox);
for(const f of ['DAO_Composition.js','DAO_Business_View.js'])vm.runInContext(fs.readFileSync(next+f,'utf8'),sandbox);
let calls=[];const ctx={daoCore:{readPaymentStatusValues:c=>{assert.equal(c,ctx);calls.push('read')},upsertPaymentStatusRow:(k,v,c)=>{assert.equal(c,ctx);calls.push('upsert')},ensurePaymentStatusHeaders:(v,c)=>{assert.equal(c,ctx);calls.push('header')}}};
sandbox.daoViewReadPaymentStatusValues_(ctx);sandbox.daoViewUpsertPaymentStatusRow_({}, {},ctx);sandbox.daoViewEnsurePaymentStatusHeaders_({},ctx);assert.deepEqual(calls,['read','upsert','header']);
console.log(`PASS: ${count} baseline equivalence cases; injected Core routing`);
