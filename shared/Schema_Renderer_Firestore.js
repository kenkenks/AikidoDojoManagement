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

function matchesType(value, type) {
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  return false;
}



// 論理 record 群を Firestore Core が書き込める document 群へ投影する。
// document ID field は本文から除外する。
function renderFirestoreDocuments(renderedSchema, records) {
  if (!renderedSchema || !Array.isArray(renderedSchema.fields)) throw new Error('INVALID_RENDERED_SCHEMA');
  if (!Array.isArray(records)) throw new Error('INVALID_PORTABLE_RECORDS');

  return records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`INVALID_PORTABLE_RECORD: ${index}`);
    const fields = {};
    let id;
    for (const field of renderedSchema.fields) {
      const value = record[field.logicalName];
      if (value === undefined || value === null) {
        if (field.required) throw new Error(`REQUIRED_FIELD_MISSING: ${field.logicalName}`);
        continue;
      }
      if (!matchesType(value, field.type)) throw new Error(`TYPE_MISMATCH:${field.logicalName}:${field.type}`);
      if (field.documentId) id = value;
      else fields[field.physicalName] = value;
    }
    if (typeof id !== 'string' || !id) throw new Error(`DOCUMENT_ID_REQUIRED: ${index}`);
    return { id, fields };
  });
}

// Renderer が期待する物理構造と、Firestore から読んだ document 群を照合する。
// document ID は本文 field ではなく、仮想的な primary-key field として扱う。
function verifyFirestoreDocuments(renderedSchema, documents) {
  if (!renderedSchema || !Array.isArray(renderedSchema.fields)) throw new Error('INVALID_RENDERED_SCHEMA');
  if (!Array.isArray(documents)) throw new Error('INVALID_FIRESTORE_DOCUMENTS');

  const errors = [];
  for (const document of documents) {
    const id = document?.id;
    const fields = document?.fields;
    if (typeof id !== 'string' || !id) {
      errors.push({ documentId: id || '', field: renderedSchema.documentIdField, error: 'DOCUMENT_ID_REQUIRED' });
      continue;
    }
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      errors.push({ documentId: id, field: '', error: 'DOCUMENT_FIELDS_REQUIRED' });
      continue;
    }

    for (const field of renderedSchema.fields) {
      const value = field.documentId ? id : fields[field.physicalName];
      if (value === undefined || value === null) {
        if (field.required) errors.push({ documentId: id, field: field.physicalName, error: 'REQUIRED_FIELD_MISSING' });
        continue;
      }
      if (!matchesType(value, field.type)) {
        errors.push({ documentId: id, field: field.physicalName, error: `TYPE_MISMATCH:${field.type}` });
      }
    }
  }

  return {
    ok: errors.length === 0,
    entity: renderedSchema.entity,
    collection: renderedSchema.collection,
    documents: documents.length,
    errors
  };
}

// Firestore document (ID + physical fields) を論理 DTO に戻す。
// 物理名の対応は PDD 由来の renderedSchema のみを参照する。
function restoreFirestoreRecord(renderedSchema, document) {
  if (!renderedSchema || !Array.isArray(renderedSchema.fields)) throw new Error('INVALID_RENDERED_SCHEMA');
  if (!document || typeof document.id !== 'string' || !document.id) throw new Error('DOCUMENT_ID_REQUIRED');
  if (!document.fields || typeof document.fields !== 'object' || Array.isArray(document.fields)) throw new Error('DOCUMENT_FIELDS_REQUIRED');
  const record = {};
  const knownPhysicalFields = new Set();
  for (const field of renderedSchema.fields) {
    if (!field.documentId) knownPhysicalFields.add(field.physicalName);
    const value = field.documentId ? document.id : document.fields[field.physicalName];
    if (value === undefined || value === null) {
      if (field.required) throw new Error(`REQUIRED_FIELD_MISSING: ${field.logicalName}`);
      continue;
    }
    if (!matchesType(value, field.type)) throw new Error(`TYPE_MISMATCH:${field.logicalName}:${field.type}`);
    record[field.logicalName] = value;
  }
  for (const name of Object.keys(document.fields)) {
    if (!knownPhysicalFields.has(name)) throw new Error(`UNMAPPED_PHYSICAL_FIELD: ${name}`);
  }
  return record;
}

module.exports = { renderFirestoreSchema, renderFirestoreDocuments, verifyFirestoreDocuments, restoreFirestoreRecord };
