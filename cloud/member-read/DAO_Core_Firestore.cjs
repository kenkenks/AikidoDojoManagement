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
  async function write(source, documentId, values, exists) {
    const id = normalizeStorageId(documentId);
    const collection = normalizeStorageId(source.collection);
    const fields = Object.fromEntries(Object.entries(values).map(([key,value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string') throw new Error('UNSUPPORTED_WRITE_VALUE');
      return [key,{stringValue:value}];
    }));
    if (!Object.keys(fields).length) throw new Error('EMPTY_WRITE');
    const token = config.mode === 'emulator' ? 'owner' : await getAccessToken?.();
    if (typeof token !== 'string' || !token.trim()) throw new Error('ACCESS_TOKEN_REQUIRED');
    const query = new URLSearchParams({'currentDocument.exists':String(exists)});
    for (const key of Object.keys(fields)) query.append('updateMask.fieldPaths',key);
    const response = await fetchImpl(`${base}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?${query}`, {
      method:'PATCH', headers:{Authorization:'Bearer '+token.trim(),'Content-Type':'application/json'},
      body:JSON.stringify({fields}), redirect:'error', signal:AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      const error = await response.json();
      if (exists && response.status === 404 && error?.error?.status === 'NOT_FOUND') return {found:false};
      throw new Error('FIRESTORE_HTTP_'+response.status);
    }
    return exists ? {found:true} : undefined;
  }
  return {
    append: (source,id,values) => write(source,id,values,false),
    updateByKey: (source,id,values) => write(source,id,values,true),
    async readById(source, documentId) {
    const id = normalizeStorageId(documentId);
    const collection = normalizeStorageId(source.collection);
    const headers = {};
    if (config.mode === 'emulator') headers.Authorization = 'Bearer owner'; // Emulator専用管理者。公開API用ではない。
    else {
      const token = await getAccessToken?.();
      if (typeof token !== 'string' || !token.trim()) throw new Error('ACCESS_TOKEN_REQUIRED');
      headers.Authorization = 'Bearer ' + token.trim();
    }
    const response = await fetchImpl(`${base}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
      method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(10000)
    });
    if (response.status === 404) {
      const error = await response.json();
      if (error?.error?.status === 'NOT_FOUND') return null;
      throw new Error('FIRESTORE_HTTP_404');
    }
    if (!response.ok) throw new Error('FIRESTORE_HTTP_' + response.status);
    const document = await response.json();
    const expected = `projects/${config.projectId}/databases/(default)/documents/${collection}/${id}`;
    if (document.name !== expected) throw new Error('INVALID_DOCUMENT_PATH');
    return decodeFields(document.fields || {});
  } };
}
module.exports = { createFirestoreCore, firestoreEndpoint };

