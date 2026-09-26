function dojoTimeTravelApplication_(spreadsheet) {
  return DojoTimeTravel.createApplication({spreadsheet:spreadsheet||SpreadsheetApp.getActiveSpreadsheet(),timezone:Session.getScriptTimeZone(),formatDate:(date,zone,pattern)=>Utilities.formatDate(date,zone,pattern)});
}
// 実際のSheet I/Oを一時シートで検証し、必ず片付ける。99_設定の値は変更しない。
function runner_timeTravelPortable_smoke() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const sheet=ss.insertSheet('__TIME_TEST_'+Utilities.getUuid().slice(0,8));
  try {
    sheet.getRange(1,1,1,2).setValues([['key','value']]);
    const app=dojoTimeTravelApplication_({getSheetByName:()=>sheet});
    const enabled=app.saveTimeTravel({enabled:true,now:'2099-07-09T10:00:00+09:00',target_month:'2099-07'});
    if(!enabled.ok||enabled.effective.target_month!=='2099-07')throw new Error('ENABLE_FAILED');
    const updated=app.saveTimeTravel({enabled:true,now:'2099-07-10T10:00:00+09:00',target_month:'2099-08'});
    if(updated.effective.target_month!=='2099-08'||sheet.getLastRow()!==4)throw new Error('UPDATE_FAILED');
    if(app.getTimeTravel().target_month!=='2099-08')throw new Error('READ_FAILED');
    const disabled=app.saveTimeTravel({enabled:false});
    if(!disabled.ok||disabled.effective.time_travel_enabled)throw new Error('DISABLE_FAILED');
    return {ok:true,message:'TIME-TRAVEL-PORTABLE PASS',success:4,actual:dojoTimeTravelApplication_().getSystemContext()};
  } finally {ss.deleteSheet(sheet);}
}
