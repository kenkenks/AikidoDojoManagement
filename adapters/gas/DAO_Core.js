'use strict';
const {tableDefinitions}=require('./DAO_Definitions.js');
function createCore(config, dependencies = {}) {
  const ss = dependencies.spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  function locate(source,id,reading=false) {
    const sheet=ss.getSheetByName(source.sheet);
    if(!sheet) {if(reading)return {values:[],row:0};throw new Error(source.sheet+'シートがありません。');}
    const values=sheet.getDataRange().getValues();
    let row=0;
    for(let i=1;i<values.length;i++) if(String(values[i][source.keyColumn-1]||'').trim()===id) row=i+1;
    return {sheet,values,row};
  }
  return {
    readById(source,id) { const {values,row}=locate(source,id,true); return row ? {key:id,value:values[row-1][source.valueColumn-1] ?? ''} : null; },
    updateByKey(source,id,values) { const {sheet,row}=locate(source,id); if(!row) return {found:false}; sheet.getRange(row,source.valueColumn).setNumberFormat('@').setValue(values.value); return {found:true}; },
    append(source,id,values) { const {sheet}=locate(source,id); const row=sheet.getLastRow()+1; sheet.getRange(row,source.keyColumn).setValue(id); sheet.getRange(row,source.valueColumn).setNumberFormat('@').setValue(values.value); },
    withAttendance(work) {
      // STEP3-D temporary route proof: emitted only when the Portable GAS DAO attendance path is entered.
      if(typeof console!=='undefined' && console.log) console.log('[PORTABLE-DAO] backend=gas scope=attendance event=ENTER');
      if(typeof dependencies.projectAttendances!=='function') throw new Error('ATTENDANCE_PROJECTION_REQUIRED');
      const lock=dependencies.lock || LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const tables={};
        let attendanceSheet,headers;
        for(const [name,definition] of Object.entries(tableDefinitions)) {
          const sheet=ss.getSheetByName(definition.sheet);
          if(!sheet) throw new Error(definition.sheet+'シートがありません。');
          const [columns,...rows]=sheet.getDataRange().getValues();
          tables[name]=rows.map((row,index)=>({...Object.fromEntries(columns.map((key,column)=>[key,row[column]])),_rowNumber:index+2}));
          if(name==='attendances') {attendanceSheet=sheet;headers=columns;}
        }
        const plan=work(tables);
        if(typeof console!=='undefined' && console.log) {
          const counts=(plan.writes||[]).reduce((acc,write)=>{acc[write.kind]=(acc[write.kind]||0)+1;return acc;},{});
          console.log('[PORTABLE-DAO] backend=gas scope=attendance event=PLAN writes='+JSON.stringify(counts));
        }
        if(!plan.result.ok) return plan.result;
        for(const write of plan.writes) {
          if(write.kind==='update') for(const key of Object.keys(write.values)) if(!headers.includes(key)) throw new Error('出席ログに列がありません: '+key);
          if(write.kind==='append') for(const key of ['attendance_id','稽古日','登録日時','member_id','target_month','location_id','slot_id','billing_block_id','teacher_id','attendance_session_id','稽古時間分','状態','source']) if(!headers.includes(key)) throw new Error('出席ログに列がありません: '+key);
        }
        for(const write of plan.writes) {
          if(write.kind==='update') for(const [key,value] of Object.entries(write.values)) attendanceSheet.getRange(write.row._rowNumber,headers.indexOf(key)+1).setValue(value);
          if(write.kind==='append') attendanceSheet.getRange(attendanceSheet.getLastRow()+1,1,1,headers.length).setValues([headers.map(key=>write.row[key]??'')]);
          if(write.kind==='projection') dependencies.projectAttendances(write);
        }
        if(typeof console!=='undefined' && console.log) console.log('[PORTABLE-DAO] backend=gas scope=attendance event=COMMIT ok=true');
        return plan.result;
      } finally {lock.releaseLock();}
    }
  };
}
module.exports={createCore,backend:'gas'};
