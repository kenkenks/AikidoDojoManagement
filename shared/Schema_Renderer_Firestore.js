'use strict';

// Portable Definition を Firestore の物理表現へ投影する。
// Firestore への I/O は行わず、Core が実行できる記述だけを返す。
function renderFirestoreSchema(definition) {
  if (!definition || typeof definition !== 'object') throw new Error('INVALID_PORTABLE_DEFINITION');
  const source = definition.sources?.firestore;
  const schema = definition.schema;
  if (!source?.collection || !source.keyField || !source.fields) throw new Error('FIRESTORE_MAPPING_REQUIRED');
  if (!schema?.fields || typeof schema.fields !== 'object') throw new Error('PORTABLE_SCHEMA_REQUIRED');

  const fields = Object.entries(source.fields).map(([logicalName, physicalName]) => {
    const field = schema.fields[logicalName];
    if (!field) throw new Error(`PORTABLE_SCHEMA_FIELD_MISSING: ${logicalName}`);
    return {
      logicalName,
      physicalName,
      type: field.type,
      required: field.required === true,
      documentId: logicalName === source.keyField
    };
  });

  const documentIdField = fields.find(field => field.documentId);
  if (!documentIdField) throw new Error('FIRESTORE_DOCUMENT_ID_FIELD_REQUIRED');

  return {
    entity: schema.entity,
    version: schema.version,
    collection: source.collection,
    documentIdField: documentIdField.physicalName,
    fields
  };
}

module.exports = { renderFirestoreSchema };
