const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {definitions}=require('../shared/DAO_Definitions.js');

function makeSheet(headers, objects=[]) {
  const rows=[headers.slice(),...objects.map(o=>headers.map(h=>o[h]??''))];
  return {
    getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),
    getLastColumn:()=>headers.length,
    getLastRow:()=>rows.length,
    getRange(row,col,numRows=1,numCols=1){return {
      getValues:()=>Array.from({length:numRows},(_,ri)=>(rows[row-1+ri]||[]).slice(col-1,col-1+numCols)),
      setNumberFormat(){return this;},
      setValue(value){while(rows.length<row)rows.push(Array(headers.length).fill(''));rows[row-1][col-1]=value;return this;},
      setValues(values){while(rows.length<row+values.length-1)rows.push(Array(headers.length).fill(''));values.forEach((vals,ri)=>vals.forEach((v,ci)=>rows[row-1+ri][col-1+ci]=v));return this;}
    };},
    objects:()=>rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))
  };
}
function sourceSheet(name,objects){
  const source=definitions[name].sources.gas;
  return makeSheet([...new Set(Object.values(source.fields))],objects);
}
function loadArtifact(){
  const source=fs.readFileSync(path.join(__dirname,'../gas/DojoAttendanceNative.js'),'utf8');
  const sandbox={console,SpreadsheetApp:{getActiveSpreadsheet(){throw new Error('spreadsheet dependency required');}},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}};
  vm.runInNewContext(source,sandbox,{filename:'DojoAttendanceNative.js'});
  return sandbox.DojoAttendanceNative;
}

test('native application runs collect make record post without emulator',()=>{
  const sheets={
    '01_会員マスタ':sourceSheet('members',[{member_id:'M1','状態':'有効'}]),
    '11_先生マスタ':sourceSheet('teachers',[{teacher_id:'T1','状態':'有効','出席受付可':true}]),
    '10_道場マスタ':sourceSheet('locations',[{location_id:'L1','状態':'有効'}]),
    '13_課金枠マスタ':sourceSheet('billingBlocks',[{billing_block_id:'B1',location_id:'L1','状態':'有効'}]),
    '12_稽古枠マスタ':sourceSheet('trainingSlots',[{slot_id:'S1',location_id:'L1',billing_block_id:'B1','稽古時間分':60,'状態':'有効'}]),
    '07_出席ログ':sourceSheet('attendance',[])
  };
  const spreadsheet={getSheetByName:name=>sheets[name]||null};
  const projections=[];
  let seq=0;
  const app=loadArtifact().createApplication({}, {
    spreadsheet,
    uuid:()=>String(++seq),
    now:()=> '2099-07-09T10:00:00+09:00',
    dateKey:value=>String(value).slice(0,10),
    projectAttendances:change=>projections.push(change)
  });
  const result=app.registerAttendanceCore({teacher_id:'T1',location_id:'L1',billing_block_id:'B1',attendance_date:'2099-07-09',target_month:'2099-07',attendance_session_id:'SESSION',attendance_items:[{member_id:'M1',slot_ids:['S1']}],require_teacher:true,sync_unselected:true});
  assert.equal(result.ok,true);
  assert.equal(result.registered_count,1);
  assert.equal(sheets['07_出席ログ'].objects().length,1);
  assert.equal(projections.length,1);
  assert.equal(projections[0].appended.length,1);
  assert.equal(projections[0].cancelled.length,0);
});
