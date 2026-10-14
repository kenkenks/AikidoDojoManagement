'use strict';
const { normalizeStorageId, decodeFields } = require('./DAO_Core_Values.cjs');
function firestoreEndpoint(config) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(config.projectId || '')) throw new Error('INVALID_PROJECT_ID');
  let origin;
  if (config.mode === 'emulator') {
    if (!config.projectId.startsWith('demo-') || !/^127\.0\.0\.1:\d{1,5}$/.test(config.host || '')) throw new Error('LOCAL_DEMO_ONLY');
    const port = Number(config.host.split(':')[1]);
    if (port < 1 || port > 65535) throw new Error('INVALID_PORT');
    origin = 'http://' + config.host;
  } else if (config.mode === 'development' && config.confirmedDevelopmentProject === config.projectId && !config.projectId.startsWith('demo-')) {
    origin = 'https://firestore.googleapis.com';
  } else throw new Error('EXPLICIT_DEVELOPMENT_TARGET_REQUIRED');
  return `${origin}/v1/projects/${config.projectId}/databases/(default)/documents`;
}
function createFirestoreCore(config, { fetchImpl = fetch, getAccessToken } = {}) {
  const base = firestoreEndpoint(config);
  async function write(source, documentId, values, exists, replace = false, updateTime) {
    const id = normalizeStorageId(documentId);
    const collection = normalizeStorageId(source.collection);
    const fields = Object.fromEntries(Object.entries(values).map(([key,value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error('UNSUPPORTED_WRITE_VALUE');
      if (typeof value === 'string') return [key,{stringValue:value}];
      if (typeof value === 'boolean') return [key,{booleanValue:value}];
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (Number.isInteger(value)) {
          if (!Number.isSafeInteger(value)) throw new Error('UNSUPPORTED_WRITE_VALUE');
          return [key,{integerValue:String(value)}];
        }
        return [key,{doubleValue:value}];
      }
      throw new Error('UNSUPPORTED_WRITE_VALUE');
    }));
    if (!Object.keys(fields).length) throw new Error('EMPTY_WRITE');
    const token = config.mode === 'emulator' ? 'owner' : await getAccessToken?.();
    if (typeof token !== 'string' || !token.trim()) throw new Error('ACCESS_TOKEN_REQUIRED');
    const query = new URLSearchParams();
    if (exists !== null && !updateTime) query.set('currentDocument.exists',String(exists));
    if (updateTime) {
      if (exists !== true || typeof updateTime !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(updateTime)) throw new Error('INVALID_UPDATE_PRECONDITION');
      query.set('currentDocument.updateTime', updateTime);
    }
    if (!replace) for (const key of Object.keys(fields)) query.append('updateMask.fieldPaths',key);
    const response = await fetchImpl(`${base}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?${query}`, {
      method:'PATCH', headers:{Authorization:'Bearer '+token.trim(),'Content-Type':'application/json'},
      body:JSON.stringify({fields}), redirect:'error', signal:AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      const error = await response.json();
      if (exists === true && response.status === 404 && error?.error?.status === 'NOT_FOUND') return {found:false};
      throw new Error('FIRESTORE_HTTP_'+response.status);
    }
    if (exists === true) return {found:true};
    if (exists === null) return {upserted:true};
    return undefined;
  }
  return {
    append: (source,id,values) => write(source,id,values,false),
    updateByKey: (source,id,values,options = {}) => write(source,id,values,true,false,options.updateTime),
    upsertByKey: (source,id,values) => write(source,id,values,null),
    replaceByKey: (source,id,values) => write(source,id,values,true,true),
    // Explicit, bounded collection pagination for administrative master readers.
    // Never silently truncate: callers must follow nextPageToken or fail on their own cap.
    async readPage(source, { pageSize = 100, pageToken = null } = {}) {
      const collection = normalizeStorageId(source.collection);
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500 ||
          (pageToken !== null && (typeof pageToken !== 'string' || !pageToken || pageToken.length > 4096))) {
        throw new Error('INVALID_PAGE_PARAMS');
      }
      const token = config.mode === 'emulator' ? 'owner' : await getAccessToken?.();
      if (typeof token !== 'string' || !token.trim()) throw new Error('ACCESS_TOKEN_REQUIRED');
      const params = new URLSearchParams({ pageSize: String(pageSize) });
      if (pageToken !== null) params.set('pageToken', pageToken);
      const response = await fetchImpl(`${base}/${encodeURIComponent(collection)}?${params}`, {
        method: 'GET', headers: { Authorization: 'Bearer ' + token.trim() },
        redirect: 'error', signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error('FIRESTORE_HTTP_' + response.status);
      const body = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          (body.documents !== undefined && !Array.isArray(body.documents)) ||
          (body.nextPageToken !== undefined && (typeof body.nextPageToken !== 'string' || !body.nextPageToken))) {
        throw new Error('INVALID_PAGE_RESPONSE');
      }
      const prefix = `projects/${config.projectId}/databases/(default)/documents/${collection}/`;
      const documents = (body.documents || []).map(doc => {
        if (!doc || typeof doc.name !== 'string' || !doc.name.startsWith(prefix) ||
            !doc.name.slice(prefix.length) || doc.name.slice(prefix.length).includes('/')) {
          throw new Error('INVALID_PAGE_RESPONSE');
        }
        return { id: doc.name.slice(prefix.length), fields: decodeFields(doc.fields || {}) };
      });
      if (documents.length > pageSize) throw new Error('INVALID_PAGE_RESPONSE');
      return { documents, nextPageToken: body.nextPageToken || null };
    },
    // Bounded equality query for attendance scopes. No collection-wide reads.
    async queryEqual(source, filters, { limit = 100, includeDocumentId = false } = {}) {
      const collection = normalizeStorageId(source.collection);
      if (!Array.isArray(filters) || filters.length < 1 || filters.length > 5 ||
          !Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('INVALID_QUERY');
      const fields = filters.map(filter => {
        if (!filter || typeof filter.field !== 'string' ||
            !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(filter.field) || filter.field.startsWith('__') ||
            typeof filter.value !== 'string' || !filter.value || filter.value.length > 1500)
          throw new Error('INVALID_QUERY');
        return {fieldFilter: {field: {fieldPath: /^[A-Za-z_][A-Za-z0-9_]*$/.test(filter.field) ? filter.field : '`' + filter.field + '`'}, op: 'EQUAL',
          value: {stringValue: filter.value}}};
      });
      if (new Set(filters.map(filter => filter.field)).size !== filters.length) throw new Error('INVALID_QUERY');
      const token = config.mode === 'emulator' ? 'owner' : await getAccessToken?.();
      if (typeof token !== 'string' || !token.trim()) throw new Error('ACCESS_TOKEN_REQUIRED');
      const structuredQuery = {from: [{collectionId: collection}],
        where: fields.length === 1 ? fields[0] : {compositeFilter: {op: 'AND', filters: fields}},
        limit};
      const requestBody = JSON.stringify({structuredQuery});
      const response = await fetchImpl(`${base}:runQuery`, {
        method: 'POST', headers: {Authorization: 'Bearer ' + token.trim(),
          'Content-Type': 'application/json'}, body: requestBody,
        redirect: 'error', signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        // Do not log raw Firestore error bodies, query values, URLs or credentials.
        // Only a bounded status/category and the known collection are diagnostic.
        let firestoreStatus = 'UNKNOWN';
        let reason = 'OTHER';
        let errorBody = '';
        try {
          errorBody = await response.text();
          const payload = JSON.parse(errorBody);
          const firestoreError = (Array.isArray(payload) ? payload.find(row => row?.error) : payload)?.error;
          const status = firestoreError?.status;
          if (typeof status === 'string' && /^[A-Z_]{3,40}$/.test(status)) firestoreStatus = status;
          const message = String(firestoreError?.message || '');
          if (/index/i.test(message)) reason = 'INDEX_REQUIRED';
          else if (/invalid.*(query|argument|filter|field|path)|unsupported.*(query|filter)|non-alphanumeric/i.test(message)) reason = 'INVALID_QUERY';
        } catch { /* A malformed error response must not hide the HTTP status. */ }
        const error = new Error('FIRESTORE_HTTP_' + response.status);
        error.firestoreOperation = 'runQuery';
        error.firestoreCollection = collection;
        error.firestoreStatus = firestoreStatus;
        error.firestoreReason = reason;
        // Explicit opt-in, development project only. Capture the exact transmitted
        // query structure on HTTP 400; never capture values, bodies or auth headers.
        if (response.status === 400 && config.mode === 'development' &&
            config.projectId === 'dojo-management-dev' &&
            process.env.FIRESTORE_QUERY_CAPTURE === '1') {
          error.firestoreQueryCapture = {
            projectId: config.projectId,
            operation: 'runQuery',
            query: {collection, fields: fields.map(filter => filter.fieldFilter.field.fieldPath),
              operator: 'EQUAL', limit},
            responseStatus: response.status,
            firestoreStatus, reason
          };
        }
        throw error;
      }
      const body = await response.text();
      const rows = body.trim() ? (body.trim().startsWith('[')
        ? JSON.parse(body) : body.trim().split(/\r?\n/).map(line => JSON.parse(line))) : [];
      if (!Array.isArray(rows)) throw new Error('INVALID_QUERY_RESPONSE');
      const prefix = `projects/${config.projectId}/databases/(default)/documents/${collection}/`;
      const documents = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('INVALID_QUERY_RESPONSE');
        if (!row.document) continue; // Firestore may emit metadata-only rows.
        if (typeof row.document.name !== 'string' || !row.document.name.startsWith(prefix) ||
            !row.document.name.slice(prefix.length) || row.document.name.slice(prefix.length).includes('/'))
          throw new Error('INVALID_QUERY_RESPONSE');
        const fields = decodeFields(row.document.fields || {});
        documents.push(includeDocumentId ? {id:row.document.name.slice(prefix.length),fields} : fields);
      }
      if (documents.length > limit) throw new Error('INVALID_QUERY_RESPONSE');
      return documents;
    },
    async readByIds(source, documentIds) {
      if (!Array.isArray(documentIds)) throw new Error('INVALID_DOCUMENT_IDS');
      const ids = documentIds.map(normalizeStorageId);
      if (ids.length === 0) return [];
      const collection = normalizeStorageId(source.collection);
      const prefix = `projects/${config.projectId}/databases/(default)/documents/${collection}/`;
      const uniqueIds = [...new Set(ids)];
      const requested = new Set(uniqueIds.map(id => prefix + id));
      const token = config.mode === 'emulator' ? 'owner' : await getAccessToken?.();
      if (typeof token !== 'string' || !token.trim()) throw new Error('ACCESS_TOKEN_REQUIRED');
      const response = await fetchImpl(`${base}:batchGet`, {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + token.trim(), 'Content-Type': 'application/json'},
        body: JSON.stringify({documents: [...requested]}),
        redirect: 'error', signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error('FIRESTORE_HTTP_' + response.status);
      // Firestore batchGet streams newline-delimited JSON; response order is unspecified.

      const body = await response.text();
      const trimmed = body.trim();

      let rows = [];

      if (trimmed) {
        if (trimmed.startsWith('[')) {
          rows = JSON.parse(trimmed);
          if (!Array.isArray(rows)) {
            throw new Error('INVALID_BATCH_GET_RESPONSE');
          }
        } else {
          rows = trimmed
            .split(/\r?\n/)
            .map(line => JSON.parse(line));
        }
      }

      const found = new Map();
      for (const row of rows) {
        const path = row.found?.name || row.missing;
        if (typeof path !== 'string' || !requested.has(path) || found.has(path) ||
            Boolean(row.found) === Boolean(row.missing)) throw new Error('INVALID_BATCH_GET_RESPONSE');
        found.set(path, row.found ? decodeFields(row.found.fields || {}) : null);
      }
      if (found.size !== requested.size) throw new Error('INCOMPLETE_BATCH_GET_RESPONSE');
      return ids.map(id => found.get(prefix + id));
    },
    async readByIdWithMetadata(source, documentId) {
      const collection = normalizeStorageId(source.collection);
      const id = normalizeStorageId(documentId);
      const token = config.mode === 'emulator' ? 'owner' : await getAccessToken?.();
      if (typeof token !== 'string' || !token.trim()) throw new Error('ACCESS_TOKEN_REQUIRED');
      const response = await fetchImpl(`${base}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
        method: 'GET', headers: {Authorization: 'Bearer ' + token.trim()},
        redirect: 'error', signal: AbortSignal.timeout(10000)
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('FIRESTORE_HTTP_' + response.status);
      const doc = await response.json();
      if (typeof doc.updateTime !== 'string' || !doc.updateTime) throw new Error('FIRESTORE_UPDATE_TIME_MISSING');
      return { fields: decodeFields(doc.fields || {}), updateTime: doc.updateTime };
    },
    async readById(source, documentId) {
      return (await this.readByIds(source, [documentId]))[0];
    }
  };
}
module.exports = { createFirestoreCore, firestoreEndpoint };

