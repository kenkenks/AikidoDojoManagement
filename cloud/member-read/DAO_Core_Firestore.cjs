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
  async function write(source, documentId, values, exists, replace = false) {
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
    if (exists !== null) query.set('currentDocument.exists',String(exists));
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
    updateByKey: (source,id,values) => write(source,id,values,true),
    upsertByKey: (source,id,values) => write(source,id,values,null),
    replaceByKey: (source,id,values) => write(source,id,values,true,true),
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
    async readById(source, documentId) {
      return (await this.readByIds(source, [documentId]))[0];
    }
  };
}
module.exports = { createFirestoreCore, firestoreEndpoint };

