'use strict';
// Deterministic identity contract. This module does not perform Firestore writes.
const GROUP = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
function monthlySelectionDocumentId(billingGroupId, targetMonth) {
  if (typeof billingGroupId !== 'string' || !GROUP.test(billingGroupId)) throw new Error('INVALID_BILLING_GROUP_ID');
  if (typeof targetMonth !== 'string' || !MONTH.test(targetMonth)) throw new Error('INVALID_TARGET_MONTH');
  // Base64url makes the two components unambiguous even when group IDs contain underscores.
  return `ms_${Buffer.from(billingGroupId, 'ascii').toString('base64url')}_${targetMonth}`;
}
function assertMonthlySelectionIdentity(row, documentId) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('INVALID_MONTHLY_SELECTION');
  const expected = monthlySelectionDocumentId(row.billing_group_id, row.target_month);
  if (documentId !== expected) throw new Error('MONTHLY_SELECTION_ID_MISMATCH');
  return expected;
}
module.exports = {monthlySelectionDocumentId, assertMonthlySelectionIdentity};
