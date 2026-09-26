'use strict';
const fs=require('fs');
const payment=fs.readFileSync('gas/DAO_Business_Payment.js','utf8');
const portable=fs.readFileSync('gas/DAO_Portable_Invoice.js','utf8');
function must(v,m){if(!v)throw new Error(m);}
must(/function daoPaymentLoadInvoiceStatusRows_\(ctx\)\s*{\s*return daoPortableInvoice_readStatusRows_\(ctx\);\s*}/m.test(payment),'READ_ROUTE_NOT_PORTABLE');
must(/function daoPaymentUpdateInvoiceStatuses_\(allocations, ctx\)\s*{\s*return daoPortableInvoice_updateStatuses_\(allocations, ctx\);\s*}/m.test(payment),'UPDATE_ROUTE_NOT_PORTABLE');
must(!/function daoPaymentUpdateInvoiceStatuses_[\s\S]*?updateCellsByRowNumber\('invoices'/m.test(payment),'ROW_NUMBER_WRITE_STILL_PRESENT');
must(/updateByKey\('invoice', invoiceId,\s*{\s*支払状態: allocation\.status\s*}\)/m.test(portable),'UPDATE_BY_KEY_NOT_FOUND');
must(/INVOICE_NOT_FOUND_FOR_STATUS_UPDATE/.test(portable),'MISSING_INVOICE_GUARD_NOT_FOUND');
must(/invalidateInvoices\(ctx\)/.test(portable),'CACHE_INVALIDATION_NOT_FOUND');
console.log('INVOICE-STEP8B LOCAL VERIFY PASS');
console.log('READ_ROUTE UPDATE_BY_INVOICE_ID STATUS_ONLY CACHE_INVALIDATION MISSING_GUARD PASS');
