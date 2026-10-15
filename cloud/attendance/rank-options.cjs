'use strict';
const {restoreMasterFields} = require('./master-fields.cjs');
// Read-only master projection matching GAS rankMaster_getOptions; no user records.
function createAttendanceRankOptions({ masterDao, pageSize = 100, maxRows = 2000 } = {}) {
  if (typeof masterDao?.readPage !== 'function') throw new TypeError('masterDao.readPage required');
  return async function readRankOptions() {
    const rows = []; let token = null; const seen = new Set();
    do {
      const page = await masterDao.readPage({ collection: 'ranks' }, { pageSize, pageToken: token });
      if (!Array.isArray(page?.documents) || page.documents.length > pageSize) throw new Error('INVALID_RANK_PAGE');
      for (const doc of page.documents) {
        if (!doc || typeof doc.id !== 'string' || !doc.id || !doc.fields || typeof doc.fields !== 'object') throw new Error('INVALID_RANK_ROW');
        const r = restoreMasterFields('Rank',doc.fields);
        if (r.rank_id != null && String(r.rank_id).trim() !== doc.id) throw new Error('RANK_ID_MISMATCH');
        if (String(r['状態'] || '').trim() !== '有効') continue;
        const display = String(r['表示名'] || '').trim();
        if (!display) continue;
        rows.push({ rank_id: doc.id, display_name: display,
          official_name: String(r['公式帳票名'] || '').trim(),
          qualification_system: String(r['資格体系'] || '').trim(),
          sort_order: Number(r['表示順'] || 999999) });
      }
      if (rows.length > maxRows) throw new Error('RANK_LIMIT_EXCEEDED');
      token = page.nextPageToken || null;
      if (token && (typeof token !== 'string' || seen.has(token))) throw new Error('RANK_PAGE_LOOP');
      if (token) seen.add(token);
    } while (token);
    rows.sort((a,b) => a.sort_order - b.sort_order);
    return { ok: true, rank_options: rows };
  };
}
module.exports = { createAttendanceRankOptions };
