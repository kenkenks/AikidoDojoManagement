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

  return daoCore_(ctx).append("payments", [{
    payment_id: payment.payment_id,
    日時: payment.日時,
    target_month: payment.target_month,
    billing_group_id: payment.billing_group_id,
    invoice_id: payment.invoice_id,
    支払方法: payment.支払方法,
    入金額: payment.入金額,
    決済ID: payment.決済ID,
    備考: payment.備考,
    reception_date: payment.reception_date,
    location_id: payment.location_id,
    billing_block_id: payment.billing_block_id,
    teacher_id: payment.teacher_id,
    reception_session_id: payment.reception_session_id
  }], ctx);
}

// 05_請求明細の支払状態 read/update persistence boundary。
// 配賦計算は payment_calculateInvoiceStatuses_ に残し、永続化は既存 DAO Core を使用する。
function daoPaymentLoadInvoiceStatusRows_(ctx) {
  ctx = daoContext_(ctx);

  return daoCore_(ctx).read('invoices', ctx).map(function(row, index) {
    return {
      // Compatibility only: payment_calculateInvoiceStatuses_ returns rowNumber in its DTO.
      // Persistence updates below use invoice_id, not the physical row number.
      rowNumber: index + 2,
      target_month: row.target_month,
      billing_group_id: row.billing_group_id,
      invoice_id: row.invoice_id,
      amount: Number(row['請求予定額'] || row['金額'] || 0),
      current_status: String(row['支払状態'] || '')
    };
  });
}

function daoPaymentUpdateInvoiceStatuses_(allocations, ctx) {
  ctx = daoContext_(ctx);

  var updated = 0;
  (allocations || []).forEach(function(allocation) {
    var invoiceId = String(allocation.invoice_id || '').trim();
    if (!invoiceId) throw new Error('INVOICE_ID_REQUIRED_FOR_STATUS_UPDATE');

    var result = daoCore_(ctx).updateByKey(
      'invoices',
      'invoice_id',
      invoiceId,
      { '支払状態': allocation.status },
      ctx
    );

    if (!result || result.found !== true) {
      throw new Error('INVOICE_NOT_FOUND_FOR_STATUS_UPDATE: ' + invoiceId);
    }
    updated++;
  });

  return { updated: updated };
}

function daoPaymentEvidenceRequiredHeaders_() {
  return [
    'evidence_id', 'invoice_id', 'member_id', 'payment_method', 'amount',
    'reception_date', 'status', 'evidence_code', 'requested_at', 'confirmed_at',
    'confirmed_by', 'posted_at', 'payment_log_id', 'remarks'
  ];
}

function daoPaymentFindEvidenceById_(evidenceId, ctx) {
  ctx = daoContext_(ctx);
  const id = normalizeId_(evidenceId);
  const rows = daoCore_(ctx).readWithRowNumbers('paymentEvidences', ctx, daoPaymentEvidenceRequiredHeaders_());
  for (let i = 0; i < rows.length; i++) {
    if (normalizeId_(rows[i]['evidence_id']) === id) {
      const row = Object.assign({}, rows[i]);
      const rowNumber = row._rowNumber;
      delete row._rowNumber;
      return { rowNumber: rowNumber, row: row };
    }
  }
  return null;
}

function daoPaymentFindInvoiceById_(invoiceId, ctx) {
  ctx = daoContext_(ctx);
  const id = normalizeId_(invoiceId);
  if (!id) return null;
  return daoCore_(ctx).read('invoices', ctx).find(function(invoice) {
    return normalizeId_(invoice['invoice_id']) === id;
  }) || null;
}

function daoPaymentUpdateEvidenceByRowNumber_(rowNumber, valuesByHeader, ctx) {
  ctx = daoContext_(ctx);
  daoCore_(ctx).updateCellsByRowNumber('paymentEvidences', [{
    rowNumber: rowNumber,
    values: valuesByHeader
  }], ctx, daoPaymentEvidenceRequiredHeaders_());
}

function daoPaymentAppendEvidence_(evidence, ctx) {
  ctx = daoContext_(ctx);
  daoCore_(ctx).appendValidated('paymentEvidences', [evidence], daoPaymentEvidenceRequiredHeaders_(), ctx);
}

function daoPaymentFindConfirmedEvidences_(ctx) {
  ctx = daoContext_(ctx);
  return daoCore_(ctx).read('paymentEvidences', ctx).filter(function(evidence) {
    return evidence.status === 'CONFIRMED';
  });
}

function daoPaymentExistsByDecisionId_(decisionId, ctx) {
  ctx = daoContext_(ctx);
  const id = String(decisionId || '').trim();
  return daoCore_(ctx).read('payments', ctx).some(function(payment) {
    return String(payment['決済ID'] || '').trim() === id;
  });
}


function daoPaymentFindEvidence_(evidenceId, ctx) {
  ctx = daoContext_(ctx);
  const id = normalizeId_(evidenceId);
  return daoCore_(ctx).read('paymentEvidences', ctx).find(function(evidence) {
    return normalizeId_(evidence['evidence_id']) === id;
  }) || null;
}

// 行全体を1回で保存する既存の更新契約をCoreへ委譲する。
function daoPaymentUpdateEvidenceRowAtomic_(rowNumber, valuesByHeader, requiredHeaders, ctx) {
  return daoCore_(ctx).updateEvidenceRowAtomic(rowNumber, valuesByHeader, requiredHeaders, ctx);
}

// 受付拡張列の順序は呼出元の定義をそのまま渡す。
function daoPaymentEnsureReceptionSchema_(headers, ctx) {
  return daoCore_(ctx).ensurePaymentReceptionSchema(headers, ctx);
}
