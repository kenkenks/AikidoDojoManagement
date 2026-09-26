// Step7-A: 06_入金ログ Portable DAO half-dash real Sheets verification.
function runner_paymentLogStep7A_portableDao_realSheets() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheet=ss.insertSheet('__PORTABLE_PAYMENT_'+Utilities.getUuid().slice(0,8));
  try {
    var headers=['payment_id','日時','target_month','billing_group_id','invoice_id','member_id','支払方法','入金額','決済ID','location_id','billing_block_id','teacher_id','reception_session_id','備考','guard'];
    sheet.getRange(1,1,2,headers.length).setValues([headers,['PAY-OLD','2099-06-01T02:00:00Z','2099-06','G000','INV-OLD','M000','現金',1000,'CASH-OLD','HONBU','B000','T001','SESSION-OLD','old','KEEP']]);
    var wrapper={getSheetByName:function(name){return name==='06_入金ログ'?sheet:null;}};
    var dao=DojoPortableDaoPaymentLog.create({}, {spreadsheet:wrapper});
    var before=dao.readAll('paymentLog');
    if(before.length!==1) throw new Error('READ_ALL_BEFORE_FAILED');
    var record={payment_id:'PAY-STEP7A',日時:'2099-07-09T02:00:00Z',target_month:'2099-07',billing_group_id:'G001',invoice_id:'INV-STEP7A',member_id:'M001',支払方法:'現金',入金額:7500,決済ID:'CASH-STEP7A',location_id:'HONBU',billing_block_id:'B_KYO_MON_1030_1230',teacher_id:'T001',reception_session_id:'RUN-STEP7A',備考:'STEP7A'};
    var append=dao.appendRecord('paymentLog',record);
    if(!append || append.appended!==true) throw new Error('APPEND_RECORD_FAILED');
    var after=dao.readAll('paymentLog');
    if(after.length!==2) throw new Error('READ_ALL_AFTER_FAILED');
    var row=after[1];
    Object.keys(record).forEach(function(key){ if(row[key]!==record[key]) throw new Error('APPENDED_VALUES_FAILED key='+key+' expected='+JSON.stringify(record[key])+' actual='+JSON.stringify(row[key])+' row='+JSON.stringify(row)); });
    if(sheet.getRange(3,15).getValue()!=='') throw new Error('PRESERVE_UNMENTIONED_COLUMN_FAILED');
    if(sheet.getLastRow()!==3) throw new Error('NO_OVERWRITE_FAILED');
    var result={ok:true,success:6,message:'PAYMENT-LOG-STEP7A PORTABLE DAO REAL SHEETS PASS',checks:['READ_ALL_BEFORE','APPEND_RECORD','READ_ALL_AFTER','APPENDED_VALUES','PRESERVE_UNMENTIONED_COLUMN','NO_OVERWRITE'],sheet:sheet.getName()};
    console.log(JSON.stringify(result)); return result;
  } finally { ss.deleteSheet(sheet); }
}
