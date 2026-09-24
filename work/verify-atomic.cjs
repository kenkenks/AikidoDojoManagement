const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(process.argv[2]||'gas');
const files=['DAO_Core_Sheets.js','DAO_Composition.js','DAO_Business_Payment.js','09_PaymentEvidenceRecord.js'];
for(const f of files)if(!fs.existsSync(path.join(root,f)))throw Error('Required file missing: '+path.join(root,f));
const baseline=fs.readFileSync(path.join(__dirname,'atomic-baseline.txt'),'utf8');
function run(modified,headers,updates,missingSheet=false){
  let row=['E1','PENDING',100,'keep'];const trace=[];
  const sheet={getName:()=> '09_決済エビデンス',getLastColumn:()=>headers.length,getRange(r,c,h,w){trace.push(['range',r,c,h,w]);return {getValues(){trace.push(['read',r]);return [r===1?headers.slice():row.slice()]},setValues(v){trace.push(['write',v]);row=v[0].slice()}}}};
  const ctx={};
  const s={console:{log(){}},ensureSheetContext(c){assert.equal(c,ctx);return c},getRequiredSheet_(n,c){assert.equal(c,ctx);trace.push(['sheet',n]);if(missingSheet)throw Error('missing sheet');return sheet},paymentEvidence_requiredHeaders_:()=>['evidence_id','status'],paymentEvidence_invalidate(c){assert.equal(c,ctx);trace.push(['invalidate'])}};
  vm.createContext(s);
  for(const f of files)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),s);
  if(!modified)vm.runInContext(baseline,s);
  let error;try{s.paymentEvidence_updateColumnsAtomic_(2,updates,ctx)}catch(e){error=e.message}
  return JSON.parse(JSON.stringify({row,trace,error}));
}
const headers=['evidence_id','status','amount','remarks'];let count=0;
for(const changes of [{status:'CONFIRMED',amount:200},{},{remarks:''},{amount:0},{status:'CONFIRMED',absent:1}]){assert.deepEqual(run(true,headers,changes),run(false,headers,changes));count++}
for(const hs of [[],['evidence_id'],['evidence_id',' status ','amount','remarks'],['evidence_id','status','status','remarks']]){assert.deepEqual(run(true,hs,{status:'CONFIRMED'}),run(false,hs,{status:'CONFIRMED'}));count++}
assert.deepEqual(run(true,headers,{},true),run(false,headers,{},true));count++;
const s={};vm.createContext(s);for(const f of ['DAO_Composition.js','DAO_Business_Payment.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),s);
let called=false;const ctx={daoCore:{updateEvidenceRowAtomic(r,v,h,c){assert.equal(r,2);assert.equal(c,ctx);assert.deepEqual(v,{status:'CONFIRMED'});assert.deepEqual(h,['status']);called=true}}};
s.daoPaymentUpdateEvidenceRowAtomic_(2,{status:'CONFIRMED'},['status'],ctx);assert(called);
console.log(`PASS: ${count} atomic-update baseline equivalence cases; injected Core routing`);
