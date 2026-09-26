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
