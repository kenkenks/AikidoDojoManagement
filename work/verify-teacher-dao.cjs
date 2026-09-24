const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
if(process.argv.length>3)throw Error('引数は適用後のgasフォルダー1つだけです');
const root=path.resolve(process.argv[2]||'gas'),files=['DAO_Core_Sheets.js','DAO_Composition.js','DAO_Business_TeacherAttendance.js','16_TeacherAttendance.js'];
for(const f of files)if(!fs.existsSync(path.join(root,f)))throw Error('必要ファイルなし: '+path.join(root,f));
const baseline=fs.readFileSync(path.join(__dirname,'teacher-baseline.txt'),'utf8');
const name='16_先生出席ログ',master='11_先生マスタ';
const headers=['teacher_attendance_id','稽古日','登録日時','teacher_id','member_id','location_id','slot_id','billing_block_id','担当区分','状態','source','取消日時','取消理由'];
const record=(id,slot,role='主先生',state='有効')=>[id,'2099-07-01','old','T1','M1','L1',slot,'B1',role,state,'test','',''];
function run(modified,options={}) {
 const tables={[name]:[headers.slice(),record('A1','S1')],[master]:[['teacher_id','member_id','組織役割','適用開始日','適用終了日'],['T1','M1','先生','','']]};
 if(options.tables)Object.assign(tables,structuredClone(options.tables));
 const trace=[];let time=0,uuid=0,writes=0;const ctx={};
 function sheet(n){if(tables[n]==null)return null;return {getName:()=>n,getLastColumn:()=>tables[n][0]?.length||0,getLastRow:()=>tables[n].length,getDataRange(){trace.push(['dataRange',n]);return {getValues(){trace.push(['readAll',n]);return structuredClone(tables[n])}}},getRange(r,c,h=1,w=1){trace.push(['range',n,r,c,h,w]);return {getValues(){trace.push(['read',n]);return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>tables[n][r-1+i]?.[c-1+j]??''))},setValues(values){trace.push(['writeRows',n,values]);write(values)},setValue(value){trace.push(['writeCell',n,value]);write([[value]])}};function write(values){if(++writes===options.failAt)throw Error('write failed');values.forEach((row,i)=>{tables[n][r-1+i]??=[];row.forEach((v,j)=>tables[n][r-1+i][c-1+j]=v)})}}}}
 ctx.ss={getSheetByName(n){trace.push(['lookup',n]);return sheet(n)},insertSheet(n){trace.push(['insert',n]);tables[n]=[];return sheet(n)}};
 function objects(n){const [h,...rows]=tables[n]||[];return rows.map(row=>Object.fromEntries(h.map((key,i)=>[key,row[i]])))}
 const s={console:{log(){}},createSheetContext(){trace.push('create');return ctx},ensureSheetContext(c){assert.equal(c,ctx);trace.push('ensure');return c},normalizeId_:v=>String(v||'').trim(),normalizeMonth:v=>String(v).slice(0,7),sup_now(){trace.push('now');return 'time'+(++time)},getRequiredSheet_(n,c){assert.equal(c,ctx);trace.push(['required',n]);const sh=sheet(n);if(!sh)throw Error('missing '+n);return sh},invalidateSheetRows(c,n){trace.push(['invalidate',n])},invalidateTeacherAttendances(){trace.push('invalidateAttendance')},getTeacherAttendances:()=>objects(name),getTeachers:()=>objects(master),getMembers:()=>[{member_id:'M1',氏名:'テスト'}],getLocations:()=>[{location_id:'L1'}],getBillingBlocks:()=>[{location_id:'L1',billing_block_id:'B1',曜日:'月'}],isActiveMasterRow_:r=>r.状態!=='取消',parseAttendanceDate_:v=>v,formatAttendanceDate_:v=>String(v),getWeekdayLabel_:()=>options.badWeekday?'火':'月',weekdayMatches_:(a,b)=>a===b,buildAttendanceSessionInfo_:()=>({ok:true,slots:[{slot_id:'S1'},{slot_id:'S2'}]}),Utilities:{getUuid:()=>String(++uuid).padStart(8,'0')},LockService:{getScriptLock:()=>({waitLock(v){trace.push(['lock',v])},releaseLock(){trace.push('unlock')}})}};
 vm.createContext(s);for(const f of files)vm.runInContext(f==='16_TeacherAttendance.js'&&!modified?baseline:fs.readFileSync(path.join(root,f),'utf8'),s);
 let result,error;try{
 if(options.action==='schema')result=s.teacherAttendance_ensureSchema(options.noContext?undefined:ctx);
 else if(options.action==='cancel')result=s.teacherAttendance_cancelRow_({teacher_attendance_id:options.id??'A1'},ctx);
 else {const data={teacher_id:'T1',location_id:'L1',billing_block_id:'B1',attendance_date:'2099-07-01',role:'主先生',slot_ids:['S1','S2'],...options.data};result=s.teacherAttendance_sync(data,ctx);if(options.repeat)result=s.teacherAttendance_sync(data,ctx);}
 }catch(e){error=e.message}
 return JSON.parse(JSON.stringify({tables,trace,result,error}));
}
const cases=[{}, {repeat:true},{data:{slot_ids:[]}},{data:{slot_ids:['S1']}},{data:{slot_ids:['S2']}},{data:{slot_ids:['S1','S1','S2']}},{data:{role:'副先生'}},{data:{role:'不正'}},{data:{slot_ids:['BAD']}},{data:{teacher_id:'UNKNOWN'}},{badWeekday:true},{tables:{[name]:[headers,record('A1','S1'),record('A2','S1')]}},{tables:{[name]:[headers,record('A1','S1','主先生','取消')]}},
 ...[{}, {tables:{[name]:null}}, {tables:{[name]:[['teacher_attendance_id']], [master]:[['teacher_id']]}},{tables:{[name]:[[]]}},{tables:{[master]:null}},{noContext:true}].map(o=>({action:'schema',...o})),
 ...[{}, {id:' A1 '},{id:'UNKNOWN'},{tables:{[name]:[headers,record('A1','S1'),record('A1','S2')]}},{tables:{[name]:[['teacher_attendance_id'],['A1']]}},{failAt:1},{failAt:2},{failAt:3}].map(o=>({action:'cancel',...o})),
 {failAt:1,data:{role:'副先生'}},{failAt:4,data:{role:'副先生'}}];
for(let i=0;i<cases.length;i++)assert.deepEqual(run(true,cases[i]),run(false,cases[i]),'case '+(i+1));
const s={};vm.createContext(s);for(const f of ['DAO_Composition.js','DAO_Business_TeacherAttendance.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),s);
const calls=[],ctx={daoCore:{ensureTeacherAttendanceSchema(a,b,c){assert.equal(c,ctx);calls.push('schema')},appendTeacherAttendanceRows(r,c){assert.equal(c,ctx);calls.push('append')},cancelTeacherAttendanceRow(r,c){assert.equal(c,ctx);calls.push('cancel')}}};s.daoTeacherAttendanceEnsureSchema_([],[],ctx);s.daoTeacherAttendanceAppend_([],ctx);s.daoTeacherAttendanceCancelRow_({},ctx);assert.deepEqual(calls,['schema','append','cancel']);
console.log(`PASS: ${cases.length} teacher-attendance baseline equivalence cases; injected Core routing`);
