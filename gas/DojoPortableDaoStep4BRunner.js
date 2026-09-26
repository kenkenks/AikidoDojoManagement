// Step4-B: Portable DAO updateByKey partial update -> real Google Sheets.
// 本番シートは変更しない。一時シートを finally で削除する。
function runner_portableDaoStep4B_updateByKey_realSheets() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var name='__PORTABLE_UPDATE_'+Utilities.getUuid().slice(0,8);
  var sheet=ss.insertSheet(name);
  try {
    sheet.getRange(1,1,2,3).setValues([
      ['key','value','guard'],
      ['STEP4B_UPDATE','before','KEEP']
    ]);
    var testSpreadsheet={getSheetByName:function(sheetName){return sheetName==='99_設定'?sheet:ss.getSheetByName(sheetName);}};
    var dao=DojoPortableDaoStep4B.create({}, {spreadsheet:testSpreadsheet});

    var updated=dao.updateByKey('setting','STEP4B_UPDATE',{value:'after'});
    if(!updated || updated.found!==true) throw new Error('UPDATE_BY_KEY_FAILED');
    if(sheet.getLastRow()!==2) throw new Error('UPDATE_APPENDED_DUPLICATE');
    var row=sheet.getRange(2,1,1,3).getValues()[0];
    if(row[0]!=='STEP4B_UPDATE' || row[1]!=='after') throw new Error('UPDATED_VALUE_FAILED');
    if(row[2]!=='KEEP') throw new Error('PARTIAL_UPDATE_DESTROYED_UNMENTIONED_FIELD');

    var missing=dao.updateByKey('setting','STEP4B_MISSING',{value:'must-not-append'});
    if(!missing || missing.found!==false) throw new Error('MISSING_RESULT_FAILED');
    if(sheet.getLastRow()!==2) throw new Error('MISSING_UPDATE_APPENDED_ROW');

    var result={ok:true,message:'PORTABLE-DAO-STEP4B UPDATE_BY_KEY REAL SHEETS PASS',success:5,sheet:name,
      checks:['UPDATE_FOUND','UPDATE_VALUE','PRESERVE_UNMENTIONED_FIELD','NO_APPEND_ON_UPDATE','MISSING_RETURNS_FALSE']};
    console.log(JSON.stringify(result));
    return result;
  } finally { ss.deleteSheet(sheet); }
}
