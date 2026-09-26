const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
function read(p){return fs.readFileSync(path.join(root,p),'utf8');}
const dao=read('gas/DAO_Business_Billing.js');
const rec=read('gas/03_BillingRecord.js');
const bridge=read('gas/DAO_Portable_MonthlySelection.js');
function need(ok,msg){if(!ok) throw new Error(msg);}
need(/daoPortableMonthlySelection_readAll_\(ctx\)/.test(dao),'READ_ROUTE_NOT_PORTABLE');
need(!/function daoBillingFindMonthlySelection_[\s\S]*?daoCore_\(ctx\)\.read\(['"]monthlySelections/.test(dao),'OLD_READ_ROUTE_REMAINS');
need(/daoPortableMonthlySelection_append_\s*\(/.test(rec),'APPEND_ROUTE_NOT_PORTABLE');
need(/readAll\(['"]monthlySelection['"]\)/.test(bridge),'PORTABLE_READ_ALL_MISSING');
need(/appendRecord\(['"]monthlySelection['"]/.test(bridge),'PORTABLE_APPEND_MISSING');
need(/invalidateMonthlySelections\(ctx\)/.test(bridge),'CACHE_INVALIDATION_MISSING');
console.log('MONTHLY-SELECTION-STEP6B EXISTING ENTRY VERIFY PASS');
console.log('READ_ROUTE APPEND_ROUTE CACHE_INVALIDATION PASS');
