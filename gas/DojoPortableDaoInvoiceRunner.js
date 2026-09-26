// Step8-A: 05_請求明細 Portable DAO half-dash real Sheets verification.
function runner_invoiceStep8A_portableDao_realSheets() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheet=ss.insertSheet('__PORTABLE_INVOICE_'+Utilities.getUuid().slice(0,8));
  try {
    var headers=['invoice_id','target_month','billing_group_id','member_id','plan_id','請求種別','表示名','数量','単価','上限金額','計算額','請求予定額','金額','支払状態','支払期限','作成日','備考','guard'];
    var old=['INV-OLD','2099-06','G000','M000','P001','月会費','旧請求',1,1000,1000,1000,1000,1000,'未払い','','2099-06-01T00:00:00Z','old','KEEP'];
    sheet.getRange(1,1,2,headers.length).setValues([headers,old]);
    var wrapper={getSheetByName:function(name){return name==='05_請求明細'?sheet:null;}};
    var dao=DojoPortableDaoInvoice.create({}, {spreadsheet:wrapper});
    var before=dao.readAll('invoice');
    if(before.length!==1) throw new Error('READ_ALL_BEFORE_FAILED');
    var record={invoice_id:'INV-STEP8A',target_month:'2099-07',billing_group_id:'G001',member_id:'M001',plan_id:'P001',請求種別:'月会費',表示名:'一般月謝',数量:1,単価:7500,上限金額:7500,計算額:7500,請求予定額:7500,金額:7500,支払状態:'未払い',支払期限:'',作成日:'2099-07-01T00:00:00Z',備考:'STEP8A'};
    var append=dao.appendRecord('invoice',record);
    if(!append || append.appended!==true) throw new Error('APPEND_RECORD_FAILED');
    var after=dao.readAll('invoice');
    if(after.length!==2) throw new Error('READ_ALL_AFTER_FAILED');
    var row=after[1];
    Object.keys(record).forEach(function(key){if(row[key]!==record[key]) throw new Error('APPENDED_VALUES_FAILED key='+key+' expected='+JSON.stringify(record[key])+' actual='+JSON.stringify(row[key])+' row='+JSON.stringify(row));});
    if(sheet.getRange(3,18).getValue()!=='') throw new Error('PRESERVE_UNMENTIONED_COLUMN_FAILED');
    if(sheet.getLastRow()!==3) throw new Error('NO_OVERWRITE_FAILED');
    var result={ok:true,success:6,message:'INVOICE-STEP8A PORTABLE DAO REAL SHEETS PASS',checks:['READ_ALL_BEFORE','APPEND_RECORD','READ_ALL_AFTER','APPENDED_17_FIELDS','PRESERVE_UNMENTIONED_COLUMN','NO_OVERWRITE'],sheet:sheet.getName()};
    console.log(JSON.stringify(result)); return result;
  } finally { ss.deleteSheet(sheet); }
}
