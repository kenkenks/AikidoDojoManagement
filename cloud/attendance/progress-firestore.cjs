'use strict';
const {restoreMasterFields} = require('./master-fields.cjs');
// Read-only adapter. WebConnect callers must authorize identity before invoking this reader.
const {projectAttendanceProgress} = require('./progress-summary.cjs');
const clean = v => String(v ?? '').trim();
const active = row => ['', '有効', '在籍', 'TRUE'].includes(clean(row?.['状態']));
async function allRows(core, collection, {restoreType='', maxPages=100}={}) {
  const rows = []; let token = null; const seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    const result = await core.readPage({collection}, {pageSize:100,pageToken:token});
    if (!result || !Array.isArray(result.documents) || result.documents.length > 100)
      throw new Error('INVALID_PROGRESS_PAGE');
    for (const doc of result.documents) {
      if (!doc || !doc.fields || typeof doc.fields !== 'object') throw new Error('INVALID_PROGRESS_ROW');
      rows.push(restoreType ? restoreMasterFields(restoreType,doc.fields,doc.id) : {...doc.fields,__document_id:doc.id});
    }
    if (!result.nextPageToken) return rows;
    if (seen.has(result.nextPageToken)) throw new Error('PROGRESS_PAGINATION_LOOP');
    seen.add(result.nextPageToken); token = result.nextPageToken;
  }
  throw new Error('PROGRESS_PAGE_LIMIT');
}
async function allMasterRows(core, collection) {
  return allRows(core,collection,{restoreType:collection==='ranks'?'Rank':'ExaminationStandard',maxPages:10});
}
function projectionMasters(member,standards,ranks) {
  const currentRank = clean(member.current_rank);
  const matches = standards.filter(row => active(row) && clean(row['現在級段位']) === currentRank);
  const rankMatches = ranks.filter(row => active(row) && clean(row['表示名']) === currentRank);
  if (matches.length > 1 || rankMatches.length > 1) throw new Error('DUPLICATE_PROGRESS_MASTER');
  const standardRow = matches[0] || {};
  const rankRow = rankMatches[0] || {};
  const rawCount = standardRow['必要稽古数'];
  const rawDays = standardRow['必要稽古日数'];
  if (rawCount != null && clean(rawCount) !== '' && (!Number.isFinite(Number(rawCount)) || Number(rawCount) < 0))
    throw new Error('INVALID_PROGRESS_STANDARD');
  if (rawDays != null && clean(rawDays) !== '' && (!Number.isFinite(Number(rawDays)) || Number(rawDays) < 0))
    throw new Error('INVALID_PROGRESS_STANDARD_DAYS');
  return {
    standard:{next_rank:clean(standardRow['次回審査級段位']),note:clean(standardRow['備考']),
      required_training_count:Math.floor(Number(rawCount || 0)),required_training_days:Math.floor(Number(rawDays || 0)),
      progress_display_enabled:standardRow['進捗表示対象'] === true ||
        ['true','1','yes','有効','対象','○'].includes(clean(standardRow['進捗表示対象']).toLowerCase())},
    rankOption:{rank_id:clean(rankRow.rank_id),sort_order:rankRow['表示順']}
  };
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
    const {standard,rankOption}=projectionMasters(member,standards,ranks);
    return projectAttendanceProgress({member:{...member,member_id:memberId},attendanceRows,
      standard,rankOption});
  };
}
function createFirestoreProgressBatchReader(core) {
  if (typeof core?.readPage !== 'function') throw new TypeError('PROGRESS_DAO_REQUIRED');
  return async function readProgressBatch() {
    const [members,attendanceRows,standards,ranks]=await Promise.all([
      allRows(core,'members'),allRows(core,'attendances'),allMasterRows(core,'examination_standards'),allMasterRows(core,'ranks')]);
    const activeMembers=members.filter(member=>['','有効','在籍','TRUE'].includes(clean(member.status)));
    const memberIds=new Set(activeMembers.map(member=>clean(member.member_id)));
    if(memberIds.has('')||memberIds.size!==activeMembers.length||activeMembers.some(member=>clean(member.__document_id)!==clean(member.member_id)))
      throw new Error('INVALID_PROGRESS_MEMBER_IDENTITY');
    const grouped=new Map([...memberIds].map(id=>[id,[]]));
    for(const row of attendanceRows){
      const memberId=clean(row.member_id);
      if(grouped.has(memberId))grouped.get(memberId).push(row);
    }
    const progressItems=activeMembers.map(member=>{
      const {standard,rankOption}=projectionMasters(member,standards,ranks);
      return projectAttendanceProgress({member,attendanceRows:grouped.get(member.member_id),standard,rankOption});
    });
    return {ok:true,member_count:progressItems.length,progress_items:progressItems};
  };
}
module.exports = {createFirestoreProgressReader,createFirestoreProgressBatchReader};
