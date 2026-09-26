// Step6-A: 04_月次選択 Portable DAO half-dash real Sheets verification.
function runner_monthlySelectionStep6A_portableDao_realSheets() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheet=ss.insertSheet('__PORTABLE_MONTHLY_'+Utilities.getUuid().slice(0,8));
  try {
    var headers=['target_month','member_id','billing_group_id','plan_id','宣言日','状態','備考','guard'];
    sheet.getRange(1,1,2,headers.length).setValues([
      headers,
      ['2099-06','M000','G000','P001','2099-06-01','有効','old','KEEP']
    ]);
    var wrapper={getSheetByName:function(name){return name==='04_月次選択'?sheet:null;}};
    var dao=DojoPortableDaoMonthlySelection.create({}, {spreadsheet:wrapper});
    var before=dao.readAll('monthlySelection');
    if(before.length!==1) throw new Error('READ_ALL_BEFORE_FAILED');
    var append=dao.appendRecord('monthlySelection',{
      target_month:'2099-07',member_id:'M001',billing_group_id:'G001',plan_id:'P001',
      宣言日:'2099-07-01',状態:'有効',備考:'STEP6A'
    });
    if(!append || append.appended!==true) throw new Error('APPEND_RECORD_FAILED');
    var after=dao.readAll('monthlySelection');
    if(after.length!==2) throw new Error('READ_ALL_AFTER_FAILED');
    var row=after[1];
    if(row.target_month!=='2099-07'||row.member_id!=='M001'||row.billing_group_id!=='G001'||row.plan_id!=='P001'||row.状態!=='有効'||row.備考!=='STEP6A') throw new Error('APPENDED_VALUES_FAILED actual='+JSON.stringify(row));
    if(sheet.getRange(3,8).getValue()!=='') throw new Error('PRESERVE_UNMENTIONED_COLUMN_FAILED');
    if(sheet.getLastRow()!==3) throw new Error('ROW_COUNT_FAILED');
    var result={ok:true,success:6,message:'MONTHLY-SELECTION-STEP6A PORTABLE DAO REAL SHEETS PASS',checks:['READ_ALL_BEFORE','APPEND_RECORD','READ_ALL_AFTER','APPENDED_VALUES','PRESERVE_UNMENTIONED_COLUMN','NO_OVERWRITE'],sheet:sheet.getName()};
    console.log(JSON.stringify(result));
    return result;
  } finally { ss.deleteSheet(sheet); }
}
