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

test('Firestore Core preserves numeric and boolean field types', async () => {
  let request;
  const core = createFirestoreCore(config, {
    getAccessToken: async () => 'test-token',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return response(200);
    }
  });
  await core.append({ collection: 'members' }, 'TEST_TYPES', {
    carried_training_count: 3,
    eligible_training_count: 1.5,
    active: true,
    member_name: 'Test'
  });
  assert.deepEqual(request.fields, {
    carried_training_count: { integerValue: '3' },
    eligible_training_count: { doubleValue: 1.5 },
    active: { booleanValue: true },
    member_name: { stringValue: 'Test' }
  });
});

test('Firestore Core rejects unsupported and unsafe numeric values before I/O', async () => {
  let calls = 0;
  const core = createFirestoreCore(config, {
    getAccessToken: async () => 'test-token',
    fetchImpl: async () => { calls++; return response(200); }
  });
  for (const invalid of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, [], {}]) {
    await assert.rejects(core.append({ collection: 'members' }, 'TEST_TYPES', { count: invalid }), /UNSUPPORTED_WRITE_VALUE/);
  }
  assert.equal(calls, 0);
});
