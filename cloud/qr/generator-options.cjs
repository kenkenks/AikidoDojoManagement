'use strict';
// Firebase QR master options Business. No HTTP, authentication, or direct Firestore I/O.
const COLLECTIONS = Object.freeze({
  members: 'members', fees: 'fees', rules: 'plan_selection_rules',
  dojos: 'dojos', teachers: 'teachers'
});
const active = row => ['', '有効', '在籍', 'TRUE'].includes(String(row.status ?? '').trim());
const str = value => String(value ?? '').trim();
const compare = (a, b) => a.localeCompare(b, 'ja');

function createQrGeneratorOptions({ masterDao, pageSize = 100, maxPerCollection = 5000 } = {}) {
  if (!masterDao || typeof masterDao.readPage !== 'function') throw new TypeError('masterDao.readPage required');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500 ||
      !Number.isInteger(maxPerCollection) || maxPerCollection < pageSize) throw new Error('INVALID_MASTER_LIMIT');

  async function readCollection(collection) {
    const documents = [];
    let pageToken = null;
    const seenTokens = new Set();
    do {
      const page = await masterDao.readPage({ collection }, { pageSize, pageToken });
      if (!page || !Array.isArray(page.documents) || page.documents.length > pageSize ||
          (page.nextPageToken != null && typeof page.nextPageToken !== 'string')) throw new Error('INVALID_MASTER_PAGE');
      for (const doc of page.documents) {
        if (!doc || typeof doc.id !== 'string' || !doc.id || !doc.fields ||
            typeof doc.fields !== 'object' || Array.isArray(doc.fields)) throw new Error('INVALID_MASTER_DOCUMENT');
        documents.push({ ...doc.fields, __document_id: doc.id });
      }
      if (documents.length > maxPerCollection) throw new Error('MASTER_LIMIT_EXCEEDED');
      pageToken = page.nextPageToken || null;
      if (pageToken) {
        if (seenTokens.has(pageToken)) throw new Error('MASTER_PAGE_TOKEN_LOOP');
        seenTokens.add(pageToken);
      }
    } while (pageToken);
    return documents;
  }
  const id = (row, key) => {
    if (row[key] != null && str(row[key]) !== str(row.__document_id)) throw new Error('MASTER_ID_MISMATCH');
    return str(row.__document_id);
  };
  return async function getQrGeneratorOptions() {
    const [memberRows, feeRows, ruleRows, dojoRows, teacherRows] = await Promise.all([
      readCollection(COLLECTIONS.members), readCollection(COLLECTIONS.fees),
      readCollection(COLLECTIONS.rules), readCollection(COLLECTIONS.dojos),
      readCollection(COLLECTIONS.teachers)
    ]);
    const members = memberRows.filter(active).map(row => ({
      member_id: id(row, 'member_id'), member_name: str(row.member_name), member_type: str(row.member_type)
    })).sort((a, b) => compare(a.member_name || a.member_id, b.member_name || b.member_id));
    const plans = feeRows.filter(active).map(row => ({
      plan_id: id(row, 'plan_id'), plan_name: str(row.display_name || row.plan_id || row.__document_id),
      description: str(row.description), fee_type: str(row.membership_fee_type),
      unit_price: Number(row.unit_price || 0), cap_amount: Number(row.maximum_amount || 0)
    }));
    const plan_selection_rules = ruleRows.map(row => ({
      member_type: str(row.member_type), selectable_plan_id: str(row.selectable_plan_id)
    })).filter(row => row.member_type && row.selectable_plan_id);
    const locations = dojoRows.filter(active).map(row => ({
      location_id: id(row, 'location_id'),
      location_name: str(row.display_name || row.dojo_name || row.__document_id)
    })).sort((a, b) => compare(a.location_name, b.location_name));
    const memberNameMap = new Map(members.map(row => [row.member_id, row.member_name]));
    const teachers = teacherRows.filter(active).map(row => ({
      teacher_id: id(row, 'teacher_id'),
      teacher_name: str(row.display_name || row.full_name || memberNameMap.get(str(row.member_id)) || row.__document_id),
      member_id: str(row.member_id), role_name: str(row.position || row.organization_role)
    })).sort((a, b) => compare(a.teacher_name, b.teacher_name));
    return { ok: true, members, plans,
      monthly_plans: plans.filter(row => row.fee_type === '月会費'),
      onetime_plans: plans.filter(row => row.fee_type === '回数料金'),
      plan_selection_rules, locations, teachers };
  };
}
module.exports = { createQrGeneratorOptions };
