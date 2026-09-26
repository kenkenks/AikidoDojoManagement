function runner_invoiceStep8B_portableDao_realSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = '__PORTABLE_INVOICE_STATUS_' + Utilities.getUuid().slice(0, 8);
  var sheet = ss.insertSheet(name);
  var headers = ['invoice_id','target_month','billing_group_id','member_id','plan_id','請求種別','表示名','数量','単価','上限金額','計算額','請求予定額','金額','支払状態','支払期限','作成日','備考','KEEP_ME'];
  var checks = [];
  try {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.getRange(2,1,2,headers.length).setValues([
      ['INV-A','2099-07','G001','M001','P001','月会費','一般月謝',1,7500,7500,7500,7500,7500,'未払い','',new Date(),'','A-GUARD'],
      ['INV-B','2099-07','G001','M001','P900','審査費','審査費',1,5000,0,5000,5000,5000,'未払い','',new Date(),'','B-GUARD']
    ]);

    // Portable DAO definition points at 05_請求明細, so temporarily expose the test sheet by name.
    var real = ss.getSheetByName('05_請求明細');
    if (real) real.setName('__REAL_INVOICE_' + Utilities.getUuid().slice(0,8));
    sheet.setName('05_請求明細');
    try {
      var ctx = { ss: ss };
      var before = daoPortableInvoice_readStatusRows_(ctx);
      if (before.length !== 2) throw new Error('READ_STATUS_ROWS_FAILED');
      checks.push('READ_STATUS_ROWS');

      var result = daoPortableInvoice_updateStatuses_([
        { invoice_id:'INV-A', status:'支払済', rowNumber:999 },
        { invoice_id:'INV-B', status:'未払い', rowNumber:998 }
      ], ctx);
      if (!result || result.updated !== 2) throw new Error('UPDATE_COUNT_FAILED');
      checks.push('UPDATE_BY_INVOICE_ID');

      var values = sheet.getDataRange().getValues();
      var statusCol = headers.indexOf('支払状態');
      var guardCol = headers.indexOf('KEEP_ME');
      if (String(values[1][statusCol]) !== '支払済' || String(values[2][statusCol]) !== '未払い') throw new Error('STATUS_VALUES_FAILED');
      checks.push('PARTIAL_PAYMENT_STATUS');
      if (values[1][guardCol] !== 'A-GUARD' || values[2][guardCol] !== 'B-GUARD') throw new Error('UNMENTIONED_COLUMN_CHANGED');
      checks.push('PRESERVE_UNMENTIONED_COLUMN');
      if (values[1][0] !== 'INV-A' || values[2][0] !== 'INV-B') throw new Error('KEY_CHANGED');
      checks.push('PRESERVE_INVOICE_ID');

      var missingFailed = false;
      try { daoPortableInvoice_updateStatuses_([{invoice_id:'INV-NOT-FOUND',status:'支払済'}], ctx); }
      catch (e) { missingFailed = String(e.message).indexOf('INVOICE_NOT_FOUND_FOR_STATUS_UPDATE') >= 0; }
      if (!missingFailed) throw new Error('MISSING_INVOICE_GUARD_FAILED');
      checks.push('MISSING_INVOICE_GUARD');
    } finally {
      sheet.setName(name);
      if (real) real.setName('05_請求明細');
    }
    return {ok:true,success:checks.length,sheet:name,checks:checks,message:'INVOICE-STEP8B PORTABLE DAO REAL SHEETS PASS'};
  } finally {
    ss.deleteSheet(sheet);
  }
}
