const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
if(process.argv.length>3)throw Error('引数は適用後のgasフォルダー1つだけです');
const root=path.resolve(process.argv[2]||'gas');
const files=['DAO_Core_Sheets.js','DAO_Composition.js','DAO_Business_AttendanceProgress.js','04_AttendanceProgress.js'];
for(const f of files)if(!fs.existsSync(path.join(root,f)))throw Error('必要ファイルなし: '+path.join(root,f));
const baseline=fs.readFileSync(path.join(__dirname,'progress-baseline.txt'),'utf8');
const headers=['member_id','現在級段位','級段位登録元','級段位更新日時','級段位起算日','繰越稽古数','審査可能稽古数'];
function run(modified,initial,items,options={}){
 const rows=structuredClone(initial),trace=[],ctx={};let writes=0,clock=0;
 const sheet={getName:()=> '01_会員マスタ',getLastColumn:()=>rows[0]?.length||0,getDataRange(){trace.push('dataRange');return {getValues(){trace.push('readAll');return structuredClone(rows)}}},getRange(r,c,h,w){trace.push(['range',r,c,h,w]);return {getValues(){trace.push('readHeaders');return [rows[r-1].slice(c-1,c-1+w)]},setValues(v){trace.push(['setValues',v]);v.forEach((row,i)=>row.forEach((x,j)=>rows[r-1+i][c-1+j]=x))},setValue(v){trace.push(['setValue',v]);if(++writes===options.failAt)throw Error('write failed');rows[r-1][c-1]=v}}}};
 const s={console:{log(){}},createSheetContext(){trace.push('createContext');return ctx},ensureSheetContext(c){assert.equal(c,ctx);trace.push('ensureContext');return c},normalizeId_:v=>String(v||'').trim(),sup_now(c){assert.equal(c,ctx);trace.push('now');return 'time'+(++clock)},getRequiredSheet_(name,c){assert.equal(c,ctx);trace.push(['sheet',name]);if(options.missing)throw Error('missing sheet');return sheet},invalidateSheetRows(c,name){assert.equal(c,ctx);trace.push(['invalidate',name])},Browser:{msgBox(message){trace.push(['message',message])}}};
 vm.createContext(s);
 for(const f of files){if(f==='04_AttendanceProgress.js'&&!modified)vm.runInContext(baseline,s);else vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),s)}
 let result,error;try{result=options.setup?s.setupAttendanceProgressSchema():s.attendanceProgress_updateSelfDeclaredRanks(items,ctx)}catch(e){error=e.message}
 return JSON.parse(JSON.stringify({rows,trace,result,error}));
}
let count=0;function compare(rows,items,options){assert.deepEqual(run(true,rows,items,options),run(false,rows,items,options));count++}
const rows=[headers,['M1','二級','旧','old','','',''],['M2','三級','','','','','']];
for(const items of [null,{},[],[{member_id:'',current_rank:'二級'}],[{member_id:'M1',current_rank:'二級'}],[{member_id:'M1',current_rank:'一級'}],[{member_id:' M1 ',current_rank:' 一級 '}],[{member_id:'UNKNOWN',current_rank:'一級'}],[{member_id:'M1',current_rank:'一級'},{member_id:'M1',current_rank:'初段'}],[{member_id:'M2',current_rank:'二級'},{member_id:'M1',current_rank:'一級'}],[null]])compare(rows,items);
compare([headers,rows[1],rows[1]],[{member_id:'M1',current_rank:'一級'}]);
compare([['member_id'],['M1']],[{member_id:'M1',current_rank:'一級'}]);
compare([['member_id',' 現在級段位 '],['M1','二級']],[{member_id:'M1',current_rank:'一級'}]);
compare([['member_id','現在級段位','現在級段位'],['M1','三級','二級']],[{member_id:'M1',current_rank:'一級'}]);
compare([['氏名'],['名前']],[{member_id:'M1',current_rank:'一級'}]);
compare([[]],[{member_id:'M1',current_rank:'一級'}]);
compare(rows,[{member_id:'M1',current_rank:'一級'}],{missing:true});
for(const failAt of [1,2,3,4])compare(rows,[{member_id:'M1',current_rank:'一級'},{member_id:'M2',current_rank:'二級'}],{failAt});
for(const initial of [rows,[['member_id'],['M1']],[[]]])compare(initial,[],{setup:true});
// Businessの判定をSheetなしのCoreで実行できることを確認する。
const s={normalizeId_:v=>String(v||'').trim()};vm.createContext(s);for(const f of ['DAO_Composition.js','DAO_Business_AttendanceProgress.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),s);
const calls=[];const ctx={daoCore:{openMemberRankUpdates(h,c){assert.equal(c,ctx);return {headerInfo:{map:Object.fromEntries(headers.map((h,i)=>[h,i]))},values:rows,writeRank(...args){calls.push(args)},invalidate(){calls.push('invalidate')}}},ensureMemberRankSchema(h,c){assert.equal(c,ctx);return 3}}};
const result=s.daoAttendanceProgressUpdateRanks_([{member_id:'M1',current_rank:'一級'}],headers,ctx);assert.equal(result.updated_count,1);assert.deepEqual(calls,[[2,1,2,3,'一級','本人申告'],'invalidate']);assert.equal(s.daoAttendanceProgressEnsureSchema_(headers,ctx),3);
console.log(`PASS: ${count} attendance-progress baseline equivalence cases; injected Core routing`);
