// Step8-A: existing 05_請求明細 append persistence boundary through Portable DAO.
function daoPortableInvoice_(ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  return DojoPortableDaoInvoice.create({}, { spreadsheet: ctx.ss });
}

function daoPortableInvoice_append_(invoice, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  var result = daoPortableInvoice_(ctx).appendRecord('invoice', {
    invoice_id: invoice.invoice_id,
    target_month: invoice.target_month,
    billing_group_id: invoice.billing_group_id,
    member_id: invoice.member_id,
    plan_id: invoice.plan_id,
    請求種別: invoice.請求種別,
    表示名: invoice.表示名,
    数量: invoice.数量,
    単価: invoice.単価,
    上限金額: invoice.上限金額,
    計算額: invoice.計算額,
    請求予定額: invoice.請求予定額,
    金額: invoice.金額,
    支払状態: invoice.支払状態,
    支払期限: invoice.支払期限 || '',
    作成日: invoice.作成日 || sup_now(ctx),
    備考: invoice.備考 || ''
  });
  if (result && result.appended) invalidateInvoices(ctx);
  return result;
}


// Step8-B: payment status update persistence boundary.
// Read order is preserved for the legacy allocation algorithm, but physical row numbers
// are deliberately not used for writes. invoice_id is the persistence identity.
function daoPortableInvoice_readStatusRows_(ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  return daoPortableInvoice_(ctx).readAll('invoice').map(function(row, index) {
    return {
      // Compatibility only: payment_calculateInvoiceStatuses_ returns rowNumber in its DTO.
      // Portable persistence below ignores this value and updates by invoice_id.
      rowNumber: index + 2,
      target_month: row.target_month,
      billing_group_id: row.billing_group_id,
      invoice_id: row.invoice_id,
      amount: Number(row.請求予定額 || row.金額 || 0),
      current_status: String(row.支払状態 || '')
    };
  });
}

function daoPortableInvoice_updateStatuses_(allocations, ctx) {
  ctx = ensureSheetContext(ctx || createSheetContext());
  var dao = daoPortableInvoice_(ctx);
  var updated = 0;
  (allocations || []).forEach(function(allocation) {
    var invoiceId = String(allocation.invoice_id || '').trim();
    if (!invoiceId) throw new Error('INVOICE_ID_REQUIRED_FOR_STATUS_UPDATE');
    var result = dao.updateByKey('invoice', invoiceId, {
      支払状態: allocation.status
    });
    if (!result || result.found !== true) {
      throw new Error('INVOICE_NOT_FOUND_FOR_STATUS_UPDATE: ' + invoiceId);
    }
    updated++;
  });
  if (updated > 0) invalidateInvoices(ctx);
  return { updated: updated };
}
