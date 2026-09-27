const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {tableDefinitions}=require('../shared/DAO_Definitions.js');
const adapterSource=fs.readFileSync(path.join(__dirname,'../adapters/gas/DAO_Core.js'),'utf8');
function loadGasCore(){
  const module={exports:{}};
  const sandbox={module,exports:module.exports,console,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},SpreadsheetApp:{getActiveSpreadsheet(){throw new Error('spreadsheet dependency required');}},require:id=>{if(id==='./DAO_Definitions.js') return {tableDefinitions}; throw new Error('unexpected require '+id);}};
  vm.runInNewContext(adapterSource,sandbox,{filename:'DAO_Core.js'});
  return module.exports.createCore;
}
const createCore=loadGasCore();
const {createDao}=require('../shared/DAO_Business.js');
const {recordAttendancePlan}=require('../shared/AttendanceNative.js');

const headers=['attendance_id','稽古日','登録日時','member_id','target_month','location_id','slot_id','billing_block_id','teacher_id','attendance_session_id','稽古時間分','状態','source','取消日時','取消者teacher_id','取消理由','備考'];
function sheet(initial=[]){
  const rows=[headers.slice(),...initial.map(r=>headers.map(h=>r[h]??''))];
  return {
    getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),
    getLastColumn:()=>headers.length,
    getLastRow:()=>rows.length,
    getRange(row,col,numRows=1,numCols=1){
      return {
        getValues:()=>Array.from({length:numRows},(_,ri)=>rows[row-1+ri].slice(col-1,col-1+numCols)),
        setNumberFormat(){return this;},
        setValue(value){while(rows.length<row) rows.push(Array(headers.length).fill('')); rows[row-1][col-1]=value; return this;},
        setValues(values){while(rows.length<row+values.length-1) rows.push(Array(headers.length).fill('')); values.forEach((vals,ri)=>vals.forEach((v,ci)=>rows[row-1+ri][col-1+ci]=v)); return this;}
      };
    },
    objects:()=>rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))
  };
}
function portable(initial=[]){
  const attendance=sheet(initial);
  const spreadsheet={getSheetByName:name=>name==='07_出席ログ'?attendance:null};
  const core=createCore({}, {spreadsheet});
  return {dao:createDao(core,'gas'),attendance};
}
function appendRow(id='NEW1'){
  return {attendance_id:id,'稽古日':'2099-07-09','登録日時':'2099-07-09T10:00:00+09:00',member_id:'M1',target_month:'2099-07',location_id:'L1',slot_id:'S2',billing_block_id:'B1',teacher_id:'T1',attendance_session_id:'SESSION','稽古時間分':60,'状態':'有効',source:'native','取消日時':'','取消者teacher_id':'','取消理由':'','備考':''};
}

test('native record applies cancel and append through Portable GAS DAO',()=>{
  const old=appendRow('OLD1'); old.slot_id='S1';
  const {dao,attendance}=portable([old]);
  const result={ok:true,message:'done'};
  const plan={result,rowsToCancel:[old],rowsToAppend:[appendRow()]};
  const actual=recordAttendancePlan(plan,{teacher_id:'T1',cancel_reason:'sync'},dao,{now:()=> '2099-07-09T11:00:00+09:00'});
  assert.equal(actual,result);
  const rows=attendance.objects();
  assert.equal(rows.length,2);
  assert.deepEqual(rows[0],{...old,'状態':'取消','取消日時':'2099-07-09T11:00:00+09:00','取消者teacher_id':'T1','取消理由':'sync'});
  assert.deepEqual(rows[1],appendRow());
});

test('native record does not write a rejected plan',()=>{
  const {dao,attendance}=portable([]);
  const result={ok:false,message:'bad'};
  assert.equal(recordAttendancePlan({result,rowsToCancel:[],rowsToAppend:[appendRow()]},{},dao,{now:()=> 'never'}),result);
  assert.equal(attendance.objects().length,0);
});
