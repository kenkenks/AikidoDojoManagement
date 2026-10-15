'use strict';
// Physical -> GAS business fields, using the existing schema/copy glossary mapping.
const schemas = require('../../shared/Attendance_Master_Schemas.generated.json');
function restoreMasterFields(table, fields, documentId) {
  const schema = schemas[table];
  if (!schema || !fields || typeof fields !== 'object') throw new Error('MASTER_MAPPING_REQUIRED');
  const row = {...fields};
  for (const field of schema.fields) {
    const {logicalName, physicalName} = field;
    if (logicalName !== physicalName && fields[physicalName] !== undefined) {
      if (fields[logicalName] !== undefined && fields[logicalName] !== fields[physicalName])
        throw new Error('CONFLICTING_MASTER_FIELDS');
      row[logicalName] = fields[physicalName];
    }
    if (field.documentId && documentId !== undefined) {
      if (row[logicalName] !== undefined && row[logicalName] !== documentId)
        throw new Error('MASTER_IDENTITY_CONFLICT');
      row[logicalName] = documentId;
    }
  }
  return row;
}
module.exports = {restoreMasterFields};
