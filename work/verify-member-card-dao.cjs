const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
if(process.argv.length>3)throw Error('引数は適用後のgasフォルダー1つだけです');
const root=path.resolve(process.argv[2]||'gas'),files=['DAO_Core_Sheets.js','DAO_Composition.js','DAO_Business_MemberCard.js','08_MemberCard.js'];
for(const f of files)if(!fs.existsSync(path.join(root,f)))throw Error('必要ファイルなし: '+path.join(root,f));
const baseline=fs.readFileSync(path.join(__dirname,'card-baseline.txt'),'utf8');
function run(modified,o={}){
 const trace=[],tables={'01_会員マスタ':[['member_id','氏名','状態'],['M1','会員一','有効'],['M2','会員二','退会']],...(o.tables||{})};let writes=0;
 function sheet(name){return new Proxy({}, {get(_,method){if(method==='getName')return ()=>name;if(method==='getDataRange')return ()=>{trace.push([name,method]);return {getValues(){trace.push([name,'getValues']);return structuredClone(tables[name])}}};if(method==='getRange')return (...args)=>{trace.push([name,method,...args]);let range;range=new Proxy({}, {get(_,op){return (...values)=>{trace.push([name,op,...values]);if(['setValue','setValues','setFormula'].includes(op)&&++writes===o.failAt)throw Error('write failed');return range}}});return range};return (...args)=>{trace.push([name,method,...args]);return sheet(name)}}})}
 const ss={getSheetByName(n){trace.push(['lookup',n]);return tables[n]==null?null:sheet(n)},insertSheet(n){trace.push(['insert',n]);tables[n]=[];return sheet(n)}};
 const s={console:{log(){}},perfLog(){},SpreadsheetApp:{getActiveSpreadsheet(){trace.push('active');return ss}},ScriptApp:{getService(){trace.push('service');return {getUrl(){trace.push('url');return o.url??'https://example.test/exec'}}}},getSetting(k){trace.push(['setting',k]);return 'https://example.test/template'},Browser:{msgBox(m){trace.push(['message',m])}}};
 vm.createContext(s);for(const f of files)vm.runInContext(f==='08_MemberCard.js'&&!modified?baseline:fs.readFileSync(path.join(root,f),'utf8'),s);
 let result,error;try{if(o.action==='template')result=s.createMemberCardTemplate();else if(o.action==='lookup')result=s.getMemberInfoForPayment(o.id??'M1');else result=s.generateMemberCards();}catch(e){error=e.message}
 return JSON.parse(JSON.stringify({trace,result,error}));
}
const member='01_会員マスタ';
const cases=[{}, {tables:{'08_会員カード':[['old']]}},{tables:{[member]:[['member_id','氏名','状態']]}},{tables:{[member]:[['member_id','氏名','状態'],['M1','退会者','退会']]}},{tables:{[member]:[['member_id','氏名','状態'],['A &日本','名前',''],['M3','在籍',' 退会 '],['','','']]}},{tables:{[member]:null}},{failAt:1},{failAt:2},{url:''},
 ...[{}, {tables:{'08_会員カード_テンプレート':[['old']]}},{failAt:1},{failAt:6},{failAt:10}].map(o=>({action:'template',...o})),
 ...[{}, {id:' M1 '},{id:'UNKNOWN'},{id:'M2'},{tables:{[member]:[['氏名'],['名前']]}},{tables:{[member]:[['member_id'],['M1']]}},{tables:{[member]:[]}},{tables:{[member]:null}},{tables:{[member]:[[' member_id ',' 氏名 '],[' M1 ','first'],['M1','second']]}},{tables:{[member]:[['member_id','氏名'],...Array.from({length:8},(_,i)=>['X'+i,'名前'])]},id:'none'},{id:''}].map(o=>({action:'lookup',...o}))];
for(let i=0;i<cases.length;i++)assert.deepEqual(run(true,cases[i]),run(false,cases[i]),'case '+(i+1));
const calls=[],s={daoCore_:()=>({beginMemberCards(h){calls.push(['begin',h]);return 'access'},createMemberCardTemplate(){calls.push('template')},readMemberCardMemberValues(){calls.push('read');return []}})};vm.createContext(s);vm.runInContext(fs.readFileSync(path.join(root,'DAO_Business_MemberCard.js'),'utf8'),s);assert.equal(s.daoMemberCardBegin_(['id']),'access');s.daoMemberCardCreateTemplate_();s.daoMemberCardReadMemberValues_();assert.deepEqual(calls,[['begin',['id']],'template','read']);
console.log(`PASS: ${cases.length} member-card baseline equivalence cases; Core routing`);
