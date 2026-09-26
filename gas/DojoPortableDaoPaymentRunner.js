// Step5-A: PaymentEvidence Portable DAO -> real Google Sheets.
// Production sheet is untouched; a temporary sheet is deleted in finally.
function runner_paymentEvidenceStep5A_portableDao_realSheets() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var name='__PORTABLE_EVIDENCE_'+Utilities.getUuid().slice(0,8);
  var sheet=ss.insertSheet(name);
  try {
    var headers=['evidence_id','invoice_id','member_id','payment_method','amount','reception_date','status','evidence_code','requested_at','confirmed_at','confirmed_by','posted_at','payment_log_id','remarks'];
    var original=['EV-STEP5A','INV-1','M001','PAYPAY',1500,'2099-07-10','REQUESTED','','2099-07-10T09:00:00+09:00','','','','','KEEP'];
    sheet.getRange(1,1,2,headers.length).setValues([headers,original]);
    var testSpreadsheet={getSheetByName:function(sheetName){return sheetName==='09_決済エビデンス'?sheet:ss.getSheetByName(sheetName);}};
    var dao=DojoPortableDaoPayment.create({}, {spreadsheet:testSpreadsheet});

    var before=dao.readById('paymentEvidence','EV-STEP5A');
    if(!before || before.status!=='REQUESTED' || before.remarks!=='KEEP') throw new Error('READ_BY_ID_FAILED');

    var confirmed=dao.updateByKey('paymentEvidence','EV-STEP5A',{
      status:'CONFIRMED',evidence_code:'CODE-5A',confirmed_at:'2099-07-10T10:00:00+09:00',confirmed_by:'T001'
    });
    if(!confirmed || confirmed.found!==true) throw new Error('CONFIRMED_UPDATE_FAILED');
    var afterConfirmed=dao.readById('paymentEvidence','EV-STEP5A');
    if(afterConfirmed.status!=='CONFIRMED' || afterConfirmed.evidence_code!=='CODE-5A' || afterConfirmed.confirmed_by!=='T001') throw new Error('CONFIRMED_READ_FAILED');
    if(afterConfirmed.invoice_id!=='INV-1' || afterConfirmed.member_id!=='M001' || afterConfirmed.remarks!=='KEEP') throw new Error('CONFIRMED_PRESERVE_FAILED');

    var posted=dao.updateByKey('paymentEvidence','EV-STEP5A',{status:'POSTED',posted_at:'2099-07-10T11:00:00+09:00',payment_log_id:'PAY-5A'});
    if(!posted || posted.found!==true) throw new Error('POSTED_UPDATE_FAILED');
    var afterPosted=dao.readById('paymentEvidence','EV-STEP5A');
    if(afterPosted.status!=='POSTED' || afterPosted.payment_log_id!=='PAY-5A') throw new Error('POSTED_READ_FAILED');
    if(afterPosted.evidence_code!=='CODE-5A' || afterPosted.remarks!=='KEEP') throw new Error('POSTED_PRESERVE_FAILED');
    if(sheet.getLastRow()!==2) throw new Error('UPDATE_APPENDED_DUPLICATE');

    var result={ok:true,message:'PAYMENT-EVIDENCE-STEP5A PORTABLE DAO REAL SHEETS PASS',success:7,sheet:name,
      checks:['READ_BY_ID','CONFIRMED_UPDATE','CONFIRMED_READ','PRESERVE_ON_CONFIRMED','POSTED_UPDATE','POSTED_READ','NO_APPEND']};
    console.log(JSON.stringify(result));
    return result;
  } finally { ss.deleteSheet(sheet); }
}
