// Step5-A: PaymentEvidence persistence boundary through Portable DAO.
function daoPortablePaymentEvidence_(ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  return DojoPortableDaoPayment.create({}, { spreadsheet: ctx.ss });
}

function daoPortablePaymentEvidence_findById_(evidenceId, ctx) {
  return daoPortablePaymentEvidence_(ctx).readById('paymentEvidence', evidenceId);
}

function daoPortablePaymentEvidence_updateById_(evidenceId, values, ctx) {
  var result = daoPortablePaymentEvidence_(ctx).updateByKey('paymentEvidence', evidenceId, values);
  if (result && result.found) paymentEvidence_invalidate(ctx);
  return result;
}


// Step9-A: PayPay member route key-based Evidence accessors.
// PayPay must not depend on Sheet rowNumber for 09 persistence.
function daoPortablePaymentEvidence_findForPayPay_(evidenceId, ctx) {
  return daoPortablePaymentEvidence_findById_(evidenceId, ctx);
}

function daoPortablePaymentEvidence_updateForPayPay_(evidenceId, values, ctx) {
  return daoPortablePaymentEvidence_updateById_(evidenceId, values, ctx);
}
