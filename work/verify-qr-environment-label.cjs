const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const qr = require(path.join(root, 'web/qr/qr_generator.js'));
const sheetFiles = [
  'web/qr/sheets/teacher.html',
  'web/qr/sheets/member-card.html',
  'web/qr/sheets/payment-monthly.html',
  'web/qr/sheets/payment-onetime.html',
  'web/qr/sheets/dojo.html'
];

test('environment label requires matching explicit build identity', () => {
  assert.equal(qr.resolveEnvironmentLabel({
    qrEnvironment: { label: 'DEV', projectId: 'dojo-management-dev' },
    firebase: { projectId: 'dojo-management-dev' }
  }), 'DEV');
  assert.equal(qr.resolveEnvironmentLabel({
    qrEnvironment: { label: 'PROD', projectId: 'dojo-management-prod' },
    firebase: { projectId: 'dojo-management-prod' }
  }), 'PROD');
  for (const config of [
    {},
    { qrEnvironment: { label: 'DEV', projectId: 'other' }, firebase: { projectId: 'dojo-management-dev' } },
    { qrEnvironment: { label: 'STAGE', projectId: 'dojo-management-dev' }, firebase: { projectId: 'dojo-management-dev' } },
    { qrEnvironment: { label: 'PROD', projectId: '' }, firebase: { projectId: '' } }
  ]) assert.equal(qr.resolveEnvironmentLabel(config), 'UNKNOWN');
});

test('all printable QR templates show a monochrome environment badge', () => {
  for (const file of sheetFiles) {
    const html = read(file);
    assert.match(html, /class="environment-badge" data-qr-environment>UNKNOWN<\/div>/, file);
    assert.match(html, /<script src="\.\.\/runtime_config\.js"><\/script>\s*<script src="\.\.\/qr_generator\.js"><\/script>/, file);
    assert.match(html, /DojoQrGenerator\.applyEnvironmentLabels\(document, window\.DOJO_RUNTIME_CONFIG\)/, file);
  }
  const css = read('web/qr/assets/qr-sheet.css');
  assert.match(css, /\.environment-badge\s*\{[^}]*border:[^}]*solid #000/s);
  assert.match(css, /\.environment-badge\s*\{[^}]*background:\s*#fff;[^}]*color:\s*#000/s);
  assert.match(css, /@media print/);
});

test('B5 print cards include the resolved environment without changing QR payload construction', () => {
  const html = read('web/qr/qr_generator.html');
  assert.match(html, /resolveEnvironmentLabel\(RUNTIME_CONFIG\)/);
  assert.match(html, /class="environment-badge" data-qr-environment/);
  const actual = {
    member: qr.buildQrTargetUrl(qr.QR_TYPES.MEMBER_CARD, { member_id: 'M001' }),
    teacher: qr.buildQrTargetUrl(qr.QR_TYPES.TEACHER, { teacher_id: 'T001', location_id: 'HONBU' }),
    monthly: qr.buildQrTargetUrl(qr.QR_TYPES.PAYMENT_MONTHLY, { member_id: 'M001', plan_id: 'P001' }),
    onetime: qr.buildQrTargetUrl(qr.QR_TYPES.PAYMENT_ONETIME, { member_id: 'M001', plan_id: 'P002' }),
    dojo: qr.buildQrTargetUrl(qr.QR_TYPES.DOJO, { location_id: 'HONBU' })
  };
  assert.deepEqual(actual, {
    member: 'https://kenkenks.github.io/AikidoDojoManagement/attendance?member_id=M001',
    teacher: 'https://kenkenks.github.io/AikidoDojoManagement/attendanceCheck?teacher_id=T001&location_id=HONBU',
    monthly: 'https://kenkenks.github.io/AikidoDojoManagement/paypay_code?member_id=M001&plan_id=P001',
    onetime: 'https://kenkenks.github.io/AikidoDojoManagement/paypay_code?member_id=M001&plan_id=P002',
    dojo: 'https://kenkenks.github.io/AikidoDojoManagement/?location_id=HONBU'
  });
});

test('dev-firebase build declares DEV and generated runtime config preserves project identity', () => {
  const profile = JSON.parse(read('targets/dev-firebase.json'));
  assert.equal(profile.qrEnvironmentLabel, 'DEV');
  assert.equal(profile.projectId, 'dojo-management-dev');
  const generated = read('.build/dev-firebase/web/qr/runtime_config.js');
  assert.match(generated, /"qrEnvironment":\s*\{\s*"label": "DEV",\s*"projectId": "dojo-management-dev"/s);
  assert.match(generated, /"firebase":\s*\{[^}]*"projectId": "dojo-management-dev"/s);
});
