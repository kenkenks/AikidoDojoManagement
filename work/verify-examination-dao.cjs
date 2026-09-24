const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
if(process.argv.length>3)throw Error('引数は適用後のgasフォルダー1つだけです');
const root=path.resolve(process.argv[2]||'gas'),files=['DAO_Core_Sheets.js','DAO_Composition.js','DAO_Business_Examination.js','04_ExaminationStandard.js'];
for(const f of files)if(!fs.existsSync(path.join(root,f)))throw Error('必要ファイルなし: '+path.join(root,f));
const baseline=fs.readFileSync(path.join(__dirname,'examination-baseline.txt'),'utf8');
function run(modified,options={}){
 const tables=structuredClone(options.tables||{}),trace=[];let writes=0;
 function sheet(n){return {getName:()=>n,getLastColumn(){return tables[n][0]?.length||0},getLastRow(){trace.push(['lastRow',n]);return tables[n].length},getRange(r,c,h,w){trace.push(['range',n,r,c,h,w]);return {getValues(){trace.push(['read',n]);return [tables[n][r-1].slice(c-1,c-1+w)]},setValues(values){trace.push(['write',n,values]);if(++writes===options.failAt)throw Error('write failed');values.forEach((row,i)=>{tables[n][r-1+i]??=[];row.forEach((v,j)=>tables[n][r-1+i][c-1+j]=v)})}}},setFrozenRows(r){trace.push(['freeze',n,r])},autoResizeColumns(c,w){trace.push(['resize',n,c,w])}}}
 const ctx={ss:{getSheetByName(n){trace.push(['lookup',n]);return Object.hasOwn(tables,n)?sheet(n):null},insertSheet(n){trace.push(['insert',n]);tables[n]=[];return sheet(n)}}};
 const s={createSheetContext(){trace.push('createContext');return ctx},Browser:{msgBox(m){trace.push(['message',m])}}};vm.createContext(s);
 for(const f of files)vm.runInContext(f==='04_ExaminationStandard.js'&&!modified?baseline:fs.readFileSync(path.join(root,f),'utf8'),s);
 let result,error;try{if(options.setup){result=options.alias?s.setupExaminationStandardMaster():s.setupRankAndExaminationMasters();if(options.repeat)result=s.setupRankAndExaminationMasters()}else result=s.examinationStandard_ensureSheet_(ctx,'test',['id','name'],[['1','initial']]);}catch(e){error=e.message}
 return JSON.parse(JSON.stringify({tables,trace,result,error}));
}
const cases=[{}, {tables:{test:[['id','name']]}},{tables:{test:[['id','name'],['9','keep']]}},{tables:{test:[['id','name'],['','']]}},{tables:{test:[]}},{tables:{test:[['wrong']]}},{tables:{test:[[' id ','name']]}},{tables:{test:[['name','id']]}},{tables:{test:[['id','name','extra']]}},{failAt:1},{failAt:2},{setup:true},{setup:true,repeat:true},{setup:true,alias:true},{setup:true,failAt:3},{setup:true,failAt:4}];
for(let i=0;i<cases.length;i++)assert.deepEqual(run(true,cases[i]),run(false,cases[i]),'case '+(i+1));
const s={};vm.createContext(s);for(const f of ['DAO_Composition.js','DAO_Business_Examination.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),s);
let called=false;const h=['id'],rows=[['1']],ctx={daoCore:{ensureExaminationMaster(c,n,headers,initial){assert.equal(c,ctx);assert.equal(n,'test');assert.equal(headers,h);assert.equal(initial,rows);called=true;return 'ok'}}};assert.equal(s.daoExaminationEnsureMaster_(ctx,'test',h,rows),'ok');assert(called);
console.log(`PASS: ${cases.length} examination-master baseline equivalence cases; injected Core routing`);
