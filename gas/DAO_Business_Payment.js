// 決済一覧で使用する照会。状態選別・表示DTO生成はBusiness側に残す。
function daoPaymentLoadEvidenceReadModel_(ctx) {
  ctx = daoContext_(ctx || createSheetContext());

  const invoicesById = {};
  daoCore_(ctx).read('invoices', ctx).forEach(function(invoice) {
    invoicesById[normalizeId_(invoice["invoice_id"])] = invoice;
  });

  const memberNames = {};
  daoCore_(ctx).read('members', ctx).forEach(function(member) {
    memberNames[normalizeId_(member["member_id"])] = String(member["氏名"] || "");
  });

  return {
    invoicesById: invoicesById,
    memberNames: memberNames,
    evidences: daoCore_(ctx).read('paymentEvidences', ctx)
  };
}


function daoPaymentAppend_(ctx, payment) {
  ctx = daoContext_(ctx);



  daoCore_(ctx).append("payments", [{
    payment_id: payment.payment_id,
    日時: payment.日時,
    target_month: payment.target_month,
    billing_group_id: payment.billing_group_id,
    invoice_id: payment.invoice_id,
    member_id: payment.member_id,
    支払方法: payment.支払方法,
    入金額: payment.入金額,
    決済ID: payment.決済ID,
    location_id: payment.location_id || "",
    billing_block_id: payment.billing_block_id || "",
    teacher_id: payment.teacher_id || "",
    reception_session_id: payment.reception_session_id || "",
    備考: payment.備考
  }], ctx);


}

