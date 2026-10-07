'use strict';

const { planMemberFirestoreMigration } = require('./plan-member-firestore-migration.cjs');
const { classifyMemberFirestoreSchema } = require('./classify-member-firestore-schema.cjs');

async function executeMemberFirestoreMigration(core, source, documentId) {
  if (!core || typeof core.readById !== 'function' || typeof core.replaceByKey !== 'function') {
    throw new Error('FIRESTORE_CORE_REQUIRED');
  }
  if (!source || typeof source.collection !== 'string' || !source.collection) {
    throw new Error('FIRESTORE_SOURCE_REQUIRED');
  }
  if (typeof documentId !== 'string' || !documentId) {
    throw new Error('DOCUMENT_ID_REQUIRED');
  }

  const before = await core.readById(source, documentId);
  if (before === null) {
    return { ok: false, action: 'REJECT', reason: 'DOCUMENT_NOT_FOUND', documentId };
  }

  const plan = planMemberFirestoreMigration(before);

  if (plan.action === 'REJECT') {
    return { ok: false, ...plan, documentId };
  }

  if (plan.action === 'NO_OP') {
    return { ok: true, ...plan, documentId };
  }

  if (plan.documentId !== documentId) {
    return {
      ok: false,
      action: 'REJECT',
      schemaState: plan.schemaState,
      reason: 'DOCUMENT_ID_MISMATCH',
      documentId,
      plannedDocumentId: plan.documentId
    };
  }

  const replaced = await core.replaceByKey(source, documentId, plan.fields);
  if (!replaced || replaced.found !== true) {
    return { ok: false, action: 'REJECT', reason: 'DOCUMENT_DISAPPEARED', documentId };
  }

  const after = await core.readById(source, documentId);
  if (after === null) {
    return { ok: false, action: 'REJECT', reason: 'POST_CHECK_MISSING', documentId };
  }

  const afterState = classifyMemberFirestoreSchema(after);
  if (afterState !== 'AFTER_COMPATIBLE') {
    return {
      ok: false,
      action: 'REJECT',
      reason: 'POST_CHECK_FAILED',
      documentId,
      afterState
    };
  }

  return {
    ok: true,
    action: 'MIGRATE',
    schemaState: plan.schemaState,
    afterState,
    documentId,
    fields: after
  };
}

module.exports = { executeMemberFirestoreMigration };
