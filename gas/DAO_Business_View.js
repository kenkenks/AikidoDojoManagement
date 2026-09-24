// 会費状態ViewのI/O境界。計算・JSON解釈はView側に残す。
function daoViewReadPaymentStatusValues_(ctx) {
  return daoCore_(ctx).readPaymentStatusValues(ctx);
}

function daoViewUpsertPaymentStatusRow_(keyValues, updateValues, ctx) {
  return daoCore_(ctx).upsertPaymentStatusRow(keyValues, updateValues, ctx);
}

function daoViewEnsurePaymentStatusHeaders_(updateValues, ctx) {
  return daoCore_(ctx).ensurePaymentStatusHeaders(updateValues, ctx);
}
