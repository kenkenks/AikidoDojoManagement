const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const html = readFileSync(join(__dirname, '../web/qr/qr_generator.html'), 'utf8');
test('QR generator routes Firebase master reads through authorized WebConnect', () => {
  assert.match(html, /src="firebase_auth\.js"/);
  assert.match(html, /src="dojo_api_client\.js"/);
  assert.match(html, /IS_FIREBASE \? loadFirebaseOptions\(\) : jsonp\(GAS_URL/);
  assert.match(html, /dojoApiClient\.request\(/);
  assert.match(html, /\/api\/webconnect\?action=qr_generator_options/);
  assert.match(html, /response\.status === 403/);
});
test('GAS teacher flow remains and Firebase does not trust virtual teacher session', () => {
  assert.match(html, /else if \(!teacherSession \|\| teacherSession\.role !== "TEACHER"\)/);
  assert.match(html, /firebaseAuthClient\.signInWithGoogle\(\)/);
  assert.match(html, /Firebase mode is admin-only/);
  assert.match(html, /function jsonp\(/);
});

test('candidate routing is explicit, development-only, and fixed to the staged Cloud Run host', () => {
  assert.match(html, /get\("qr_candidate"\) === "1"/);
  assert.match(html, /RUNTIME_CONFIG\.target !== "dev-firebase"/);
  assert.match(html, /https:\/\/candidate---dojo-time-travel-admin-q6ujypei6a-an\.a\.run\.app/);
  assert.match(html, /qrOptionsApiBaseUrl\(\) \+ "\/api\/webconnect\?action=qr_generator_options"/);
  assert.doesNotMatch(html, /get\("apiBaseUrl"\)/);
});
