const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
if(process.argv.length>3)throw Error('引数は適用後のgasフォルダー1つだけです。例: node verify-schema.cjs .\\gas');
const root=path.resolve(process.argv[2]||'gas');
const files=['DAO_Core_Sheets.js','DAO_Composition.js','DAO_Business_Payment.js','06_PaymentReceptionScope.js'];
for(const f of files)if(!fs.existsSync(path.join(root,f)))throw Error('必要ファイルなし: '+path.join(root,f));
const baseline=fs.readFileSync(path.join(__dirname,'schema-baseline.txt'),'utf8');
const columns=['reception_date','location_id','billing_block_id','teacher_id','reception_session_id'];
const names=['09_決済エビデンス','06_入金ログ'];
function run(modified,initial,repeat=false,noContext=false,failWrite=false){
 const rows=structuredClone(initial),trace=[],ctx={};
 const s={console:{log(){}},createSheetContext(){trace.push('createContext');return ctx},ensureSheetContext(c){assert.equal(c,ctx);trace.push('ensureContext');return c},invalidateSheetRows(c,n){assert.equal(c,ctx);trace.push(['invalidate',n])},getRequiredSheet_(n,c){assert.equal(c,ctx);trace.push(['sheet',n]);if(rows[n]===null)throw Error('missing '+n);return {getName:()=>n,getLastColumn:()=>rows[n][0].length,getRange(r,col,h,w){trace.push(['range',n,r,col,h,w]);return {getValues(){trace.push(['read',n]);return [rows[n][0].slice(col-1,col-1+w)]},setValues(v){trace.push(['write',n,v]);if(failWrite)throw Error('write failed');v[0].forEach((x,i)=>rows[n][0][col-1+i]=x)}}}}}};
 vm.createContext(s);for(const f of files)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),s);
 if(typeof s.daoPaymentEnsureReceptionSchema_!=='function')throw Error('差分未適用: daoPaymentEnsureReceptionSchema_ がありません');
 if(!modified)vm.runInContext(baseline,s);
 let result,error;try{result=s.paymentReception_ensureSchema(noContext?undefined:ctx);if(repeat)result=s.paymentReception_ensureSchema(ctx)}catch(e){error=e.message}
 return JSON.parse(JSON.stringify({rows,trace,result,error}));
}
const cases=[
 [[['id'],['keep']], [['id'],['keep']]],
 [[['id',...columns],['keep']], [['id',...columns],['keep']]],
 [[['id','location_id'],['keep']], [['id','teacher_id'],['keep']]],
 [[['id',' location_id '],['keep']], [['id','teacher_id','teacher_id'],['keep']]],
 [[[]],[['id']]],
 [null,[['id']]],
 [[['id']],null]
];let count=0;
for(const [a,b] of cases){const initial={[names[0]]:a,[names[1]]:b};assert.deepEqual(run(true,initial),run(false,initial));count++}
const initial={[names[0]]:[['id'],['keep']],[names[1]]:[['id'],['keep']]};
for(const args of [[true,false,false],[false,true,false],[false,false,true]]){assert.deepEqual(run(true,initial,...args),run(false,initial,...args));count++}
const s={};vm.createContext(s);for(const f of ['DAO_Composition.js','DAO_Business_Payment.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),s);
let called=false;const ctx={daoCore:{ensurePaymentReceptionSchema(h,c){assert.equal(c,ctx);assert.equal(h,columns);called=true;return 'ok'}}};assert.equal(s.daoPaymentEnsureReceptionSchema_(columns,ctx),'ok');assert(called);
console.log(`PASS: ${count} reception-schema baseline equivalence cases; injected Core routing`);
