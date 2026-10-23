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
  assert.match(html, /qrAuthGate\.redirectToLogin\(window\.location\.href\)/);
  assert.match(html, /Firebase mode is admin-only/);
  assert.match(html, /function jsonp\(/);
});

test('Firebase QR initialization uses shared lifecycle and preserves selections and print items',()=>{
  for(const asset of ['auth_gate.js','page_initialization_manager.js'])assert.match(html,new RegExp(asset.replace('.','\\.')));
  assert.match(html,/requiredTasks:\[\{name:'qrOptions'/);
  assert.match(html,/if\(managerContext&&!managerContext\.isCurrent\(\)\)return false/);
  assert.match(html,/if\(qrAuthUid&&uid&&uid!==qrAuthUid\)/);
  assert.match(html,/accessLost\('authorization_lost'\)/);
  assert.match(html,/if \(previous && rows\.some/);
  assert.doesNotMatch(html,/printItems\.length = 0;[\s\S]*?authentication_lost/);
});

test('candidate routing is explicit, development-only, and fixed to the staged Cloud Run host', () => {
  assert.match(html, /get\("qr_candidate"\) === "1"/);
  assert.match(html, /RUNTIME_CONFIG\.target !== "dev-firebase"/);
  assert.match(html, /https:\/\/candidate---dojo-time-travel-admin-q6ujypei6a-an\.a\.run\.app/);
  assert.match(html, /qrOptionsApiBaseUrl\(\) \+ "\/api\/webconnect\?action=qr_generator_options"/);
  assert.doesNotMatch(html, /get\("apiBaseUrl"\)/);
});
