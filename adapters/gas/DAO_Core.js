'use strict';
const {tableDefinitions}=require('./DAO_Definitions.js');
function createCore(config, dependencies = {}) {
  const ss = dependencies.spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  function locate(source,id,reading=false) {
    const sheet=ss.getSheetByName(source.sheet);
    if(!sheet) {if(reading)return {values:[],row:0};throw new Error(source.sheet+'シートがありません。');}
    const values=sheet.getDataRange().getValues();
    const headers=(values[0]||[]).map(value=>String(value).trim());
    // Legacy definitions may provide keyColumn, while newer Portable tables use keyField.
    // Resolve the physical key column from the header when keyColumn is absent.
    let keyIndex=-1;
    if(Number.isInteger(source.keyColumn) && source.keyColumn>0) keyIndex=source.keyColumn-1;
    else if(source.keyField) keyIndex=headers.indexOf(String(source.keyField).trim());
    if(keyIndex<0) throw new Error(source.sheet+' にキー列がありません: '+String(source.keyField||source.keyColumn||''));
    let row=0;
    for(let i=1;i<values.length;i++) if(String(values[i][keyIndex]||'').trim()===String(id).trim()) row=i+1;
    return {sheet,values,row};
  }
  return {
    readAll(source) {
      const sheet=ss.getSheetByName(source.sheet);
      if(!sheet) throw new Error(source.sheet+'シートがありません。');
      const values=sheet.getDataRange().getValues();
      if(values.length===0) return [];
      const headers=(values[0]||[]).map(value=>String(value).trim());
      return values.slice(1).filter(row=>row.some(cell=>cell!==''))
        .map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]])));
    },
    appendRecord(source,values) {
      const sheet=ss.getSheetByName(source.sheet);
      if(!sheet) throw new Error(source.sheet+'シートがありません。');
      const lastColumn=sheet.getLastColumn();
      if(!lastColumn) throw new Error(source.sheet+' にヘッダーがありません。');
      const headers=sheet.getRange(1,1,1,lastColumn).getValues()[0].map(value=>String(value).trim());
      for(const field of Object.keys(values)) if(!headers.includes(field)) throw new Error(source.sheet+' に列がありません: '+field);
      const row=headers.map(header=>Object.hasOwn(values,header)?values[header]:'');
      const newRow=sheet.getLastRow()+1;
      // Google Sheets can auto-coerce string identifiers such as "2099-07" or
      // "2099-07-01" into Date values. Portable DAO must preserve the caller's
      // value type, so mark only supplied string cells as plain text before writing.
      // Numeric/boolean cells keep their native Sheets types.
      for(let column=0;column<headers.length;column++) {
        if(Object.hasOwn(values,headers[column]) && typeof row[column]==='string')
          sheet.getRange(newRow,column+1).setNumberFormat('@');
      }
      sheet.getRange(newRow,1,1,headers.length).setValues([row]);
      return {appended:true};
    },
    readById(source,id) {
      const {values,row}=locate(source,id,true);
      if(!row) return null;
      const headers=(values[0]||[]).map(value=>String(value).trim());
      const stored={};
      for(const field of Object.values(source.fields||{})) {
        const column=headers.indexOf(field);
        if(column>=0) stored[field]=values[row-1][column];
      }
      return stored;
    },
    updateByKey(source,id,values) {
      const {sheet,values:rows,row}=locate(source,id);
      if(!row) return {found:false};
      const headers=(rows[0]||[]).map(value=>String(value).trim());
      const nextRow=rows[row-1].slice();
      for(const [field,value] of Object.entries(values)) {
        if(field===source.keyField) continue;
        const column=headers.indexOf(field);
        if(column<0) throw new Error(source.sheet+' に列がありません: '+field);
        nextRow[column]=value;
      }
      // One row write preserves the existing CONFIRMED transition atomicity on real Sheets.
      // Legacy Node Sheet mocks expose only single-cell setValue; keep that test seam compatible.
      const rowRange=sheet.getRange(row,1,1,nextRow.length);
      if(rowRange && typeof rowRange.setValues==='function') rowRange.setValues([nextRow]);
      else for(const [field,value] of Object.entries(values)) {
        if(field===source.keyField) continue;
        const column=headers.indexOf(field);
        sheet.getRange(row,column+1).setValue(value);
      }
      return {found:true};
    },
    upsertByKey(source,id,values) { const {sheet,row}=locate(source,id); if(row) { sheet.getRange(row,source.valueColumn).setNumberFormat('@').setValue(values.value); return {created:false,updated:true}; } const newRow=sheet.getLastRow()+1; sheet.getRange(newRow,source.keyColumn).setValue(id); sheet.getRange(newRow,source.valueColumn).setNumberFormat('@').setValue(values.value); return {created:true,updated:false}; },
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
