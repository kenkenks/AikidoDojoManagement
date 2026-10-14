'use strict';
// Read-only adapter. Identity authorization belongs to the caller; no WebConnect exposure yet.
const {projectAttendanceProgress} = require('./progress-summary.cjs');
const clean = v => String(v ?? '').trim();
const active = row => ['', '有効', '在籍', 'TRUE'].includes(clean(row?.['状態']));
async function allMasterRows(core, collection) {
  const rows = []; let token = null; const seen = new Set();
  for (let page = 0; page < 10; page++) {
    const result = await core.readPage({collection}, {pageSize:100,pageToken:token});
    if (!result || !Array.isArray(result.documents) || result.documents.length > 100)
      throw new Error('INVALID_PROGRESS_MASTER_PAGE');
    for (const doc of result.documents) {
      if (!doc || !doc.fields || typeof doc.fields !== 'object') throw new Error('INVALID_PROGRESS_MASTER_ROW');
      rows.push(doc.fields);
    }
    if (!result.nextPageToken) return rows;
    if (seen.has(result.nextPageToken)) throw new Error('PROGRESS_MASTER_PAGINATION_LOOP');
    seen.add(result.nextPageToken); token = result.nextPageToken;
  }
  throw new Error('PROGRESS_MASTER_PAGE_LIMIT');
}
function createFirestoreProgressReader(core) {
  if (typeof core?.readById !== 'function' || typeof core?.queryEqual !== 'function' ||
      typeof core?.readPage !== 'function') throw new TypeError('PROGRESS_DAO_REQUIRED');
  return async function readProgress(memberId) {
    if (typeof memberId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(memberId))
      throw new Error('INVALID_PROGRESS_MEMBER_ID');
    const member = await core.readById({collection:'members'}, memberId);
    if (!member || !['', '有効', '在籍', 'TRUE'].includes(clean(member.status)))
      return {ok:false,message:'有効な会員が見つかりません。'};
    // A full-history count must not silently truncate at Firestore query limit.
    const attendanceRows = await core.queryEqual({collection:'attendances'},
      [{field:'member_id',value:memberId}], {limit:500});
    if (!Array.isArray(attendanceRows) || attendanceRows.length >= 500)
      throw new Error('PROGRESS_ATTENDANCE_INCOMPLETE');
    const [standards,ranks] = await Promise.all([
      allMasterRows(core,'examination_standards'), allMasterRows(core,'ranks')]);
    const currentRank = clean(member.current_rank);
    const matches = standards.filter(row => active(row) && clean(row['現在級段位']) === currentRank);
    const rankMatches = ranks.filter(row => active(row) && clean(row['表示名']) === currentRank);
    if (matches.length > 1 || rankMatches.length > 1) throw new Error('DUPLICATE_PROGRESS_MASTER');
    // Missing master row is allowed by GAS (empty standard/option); do not fabricate eligibility.
    const standardRow = matches[0] || {};
    const rankRow = rankMatches[0] || {};
    const rawCount = standardRow['必要稽古数'];
    if (rawCount != null && clean(rawCount) !== '' && (!Number.isFinite(Number(rawCount)) || Number(rawCount) < 0))
      throw new Error('INVALID_PROGRESS_STANDARD');
    const standard = {
      next_rank:clean(standardRow['次回審査級段位']),
      note:clean(standardRow['備考']),
      required_training_count:Math.floor(Number(rawCount || 0)),
      progress_display_enabled: standardRow['進捗表示対象'] === true ||
        ['true','1','yes','有効','対象','○'].includes(clean(standardRow['進捗表示対象']).toLowerCase())
    };
    return projectAttendanceProgress({member:{...member,member_id:memberId},attendanceRows,
      standard,rankOption:{rank_id:clean(rankRow.rank_id),sort_order:rankRow['表示順']}});
  };
}
module.exports = {createFirestoreProgressReader};
