'use strict';

const { classifyMemberFirestoreSchema } = require('./classify-member-firestore-schema.cjs');

function planMemberFirestoreMigration(fields) {
  const schemaState = classifyMemberFirestoreSchema(fields);

  if (schemaState === 'LEGACY_OBSERVED') {
    const documentId = fields.member_id;
    if (typeof documentId !== 'string' || documentId.length === 0) {
      return { action: 'REJECT', schemaState, reason: 'INVALID_MEMBER_ID' };
    }
    return {
      action: 'MIGRATE',
      schemaState,
      documentId,
      fields: {
        member_name: fields.name,
        status: fields.status
      }
    };
  }

  if (schemaState === 'AFTER_COMPATIBLE') {
    return { action: 'NO_OP', schemaState };
  }

  return { action: 'REJECT', schemaState, reason: 'SCHEMA_MISMATCH' };
}

module.exports = { planMemberFirestoreMigration };
