'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFirestoreCore } = require('../cloud/member-read/DAO_Core_Firestore.cjs');

const config = {
  mode: 'development',
  projectId: 'dojo-management-dev',
  confirmedDevelopmentProject: 'dojo-management-dev'
};

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

test('replaceByKey replaces the document body without updateMask', async () => {
  let request;
  const core = createFirestoreCore(config, {
    getAccessToken: async () => 'test-token',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(200, {});
    }
  });

  const result = await core.replaceByKey(
    { collection: 'members' },
    'TEST_MEMBER_001',
    { member_name: '架空の開発会員', status: '有効' }
  );

  const url = new URL(request.url);
  assert.equal(request.options.method, 'PATCH');
  assert.equal(url.pathname.endsWith('/documents/members/TEST_MEMBER_001'), true);
  assert.equal(url.searchParams.get('currentDocument.exists'), 'true');
  assert.deepEqual(url.searchParams.getAll('updateMask.fieldPaths'), []);
  assert.deepEqual(JSON.parse(request.options.body), {
    fields: {
      member_name: { stringValue: '架空の開発会員' },
      status: { stringValue: '有効' }
    }
  });
  assert.deepEqual(result, { found: true });
});

test('replaceByKey fails closed when the target document no longer exists', async () => {
  const core = createFirestoreCore(config, {
    getAccessToken: async () => 'test-token',
    fetchImpl: async () => response(404, { error: { status: 'NOT_FOUND' } })
  });

  assert.deepEqual(await core.replaceByKey(
    { collection: 'members' },
    'TEST_MEMBER_001',
    { member_name: '架空の開発会員', status: '有効' }
  ), { found: false });
});
