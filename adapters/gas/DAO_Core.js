'use strict';
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
    append(source,id,values) { const {sheet}=locate(source,id); const row=sheet.getLastRow()+1; sheet.getRange(row,source.keyColumn).setValue(id); sheet.getRange(row,source.valueColumn).setNumberFormat('@').setValue(values.value); }
  };
}
module.exports={createCore,backend:'gas'};
