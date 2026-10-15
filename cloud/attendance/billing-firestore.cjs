'use strict';
// Firestore read adapter. Monthly selection collection is deliberately explicit:
// there is no MonthlySelection.yml contract in schema/ as of ZIP116.
const {createBillingSelectionReader} = require('./billing-selection.cjs');
const {restoreMasterFields} = require('./master-fields.cjs');
const {monthlySelectionDocumentId, assertMonthlySelectionIdentity} = require('./monthly-selection-key.cjs');
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
function createBillingFirestoreReader(core, {monthlySelectionCollection, targetMonth, maxMasterRows = 500} = {}) {
  if (!core || typeof core.queryEqual !== 'function' || typeof core.readPage !== 'function' || typeof core.readById !== 'function') throw new TypeError('FIRESTORE_CORE_REQUIRED');
  if (!ID.test(monthlySelectionCollection || '')) throw new Error('MONTHLY_SELECTION_SCHEMA_UNCONFIRMED');
  if (typeof targetMonth !== 'function') throw new TypeError('TARGET_MONTH_REQUIRED');
  if (!Number.isInteger(maxMasterRows) || maxMasterRows < 1 || maxMasterRows > 500) throw new Error('INVALID_MASTER_LIMIT');
  async function master(collection) {
    let token = null;
    const seen = new Set();
    const rows = [];
    do {
      const page = await core.readPage({collection}, {pageSize:Math.min(100,maxMasterRows - rows.length),pageToken:token});
      if (!page || !Array.isArray(page.documents) || page.documents.length > Math.min(100,maxMasterRows - rows.length)) throw new Error('INVALID_MASTER_PAGE');
      for (const doc of page.documents) {
        if (!doc || !doc.fields || typeof doc.fields !== 'object' || Array.isArray(doc.fields)) throw new Error('INVALID_MASTER_DOCUMENT');
        const row=collection==='fees'?restoreMasterFields('Fee',doc.fields,doc.id):doc.fields;
        if(collection==='fees')for(const key of ['回数単価','上限金額']){
          if(row[key]!=null && row[key]!=='' &&
              (!['string','number'].includes(typeof row[key]) || !Number.isFinite(Number(row[key])) || Number(row[key])<0))
            throw new Error('INVALID_FEE_AMOUNT');
        }
        rows.push(row);
      }
      token = page.nextPageToken || null;
      if (token && (seen.has(token) || rows.length >= maxMasterRows)) throw new Error('MASTER_PAGINATION_INCOMPLETE');
      if (token) seen.add(token);
    } while (token);
    return rows;
  }
  return createBillingSelectionReader({
    targetMonth: async () => {
      const month = await targetMonth();
      if (!MONTH.test(month || '')) throw new Error('INVALID_TARGET_MONTH');
      return month;
    },
    readMonthlySelection: async (group, month) => {
      if (!ID.test(group) || !MONTH.test(month)) throw new Error('INVALID_MONTHLY_SELECTION_KEY');
      // Canonical ID read alone cannot detect legacy auto-ID duplicates.
      // Read both paths; any conflicting/duplicated representation fails closed.
      const documentId = monthlySelectionDocumentId(group, month);
      const [canonical, rows] = await Promise.all([
        core.readById({collection:monthlySelectionCollection}, documentId),
        core.queryEqual({collection:monthlySelectionCollection}, [
          {field:'billing_group_id',value:group},{field:'target_month',value:month}
        ], {limit:2})
      ]);
      if (!Array.isArray(rows) || rows.length > 1) throw new Error('DUPLICATE_MONTHLY_SELECTION');
      if (canonical !== null && canonical !== undefined) {
        assertMonthlySelectionIdentity(canonical, documentId);
        if (rows.length !== 1 || JSON.stringify(rows[0]) !== JSON.stringify(canonical))
          throw new Error('MONTHLY_SELECTION_IDENTITY_CONFLICT');
      } else if (rows.length !== 0) {
        // Legacy data exists but is not at canonical ID: migration required.
        throw new Error('LEGACY_MONTHLY_SELECTION_REQUIRES_MIGRATION');
      }
      const row = canonical || null;
      if (row && (row.billing_group_id !== group || row.target_month !== month ||
          (row['状態'] && row['状態'] !== '有効' && row['状態'] !== 'TRUE'))) throw new Error('INVALID_MONTHLY_SELECTION');
      return row;
    },
    readFees: () => master('fees'),
    readPlanSelectionRules: () => master('plan_selection_rules')
  });
}
module.exports = {createBillingFirestoreReader};
