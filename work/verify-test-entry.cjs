const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fixedUrl = 'https://dojo-management-dev.web.app/test/';

test('DEV evaluation entry has fixed identity and no embedded credentials', () => {
  const html = read('web/test/index.html');
  for (const text of ['桜風館 道場管理システム', 'DEV', '開発環境', 'TEST', '成果物評価', 'ENTRY', 'システム入口']) {
    assert.match(html, new RegExp(text));
  }
  assert.match(html, /本番運用には使用しないでください/);
  assert.match(html, /id="startEvaluation"[^>]*href="\/qr\/index\.html"/);
  assert.doesNotMatch(html, /apiKey|idToken|accessToken|member_id|teacher_id/i);
});

test('printable QR card contains the exact fixed URL and visible identifiers', () => {
  const html = read('web/test/index.html');
  assert.match(html, /id="evaluationQrCard"/);
  assert.match(html, /<strong>DEV<\/strong><strong>TEST<\/strong><strong>ENTRY<\/strong>/);
  assert.match(html, /class="qr-path">\/test\/<\/p>/);
  assert.match(html, new RegExp(fixedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /data=https%3A%2F%2Fdojo-management-dev\.web\.app%2Ftest%2F/);
  assert.match(html, /@media print/);
  assert.match(html, /QRカードを印刷/);
});

test('build copies the entry only through the explicit DEV Firebase guard', () => {
  const target = read('tools/target.mjs');
  assert.match(target, /targetName === "dev-firebase" && profile\.projectId === "dojo-management-dev"/);
  assert.match(target, /resolve\(repoRoot, "web\/test"\)/);
  assert.match(target, /join\(firebaseOutRoot, "web", "test"\)/);
  const nonFirebaseBuild = target.slice(target.indexOf('function build()'));
  assert.doesNotMatch(nonFirebaseBuild, /web\/test|firebaseTestOutDir/);
});

test('DEV build contains the entry while GAS builds do not', () => {
  const devEntry = path.join(root, '.build', 'dev-firebase', 'web', 'test', 'index.html');
  assert.ok(fs.existsSync(devEntry), 'run the dev-firebase build before this assertion');
  assert.equal(fs.readFileSync(devEntry, 'utf8'), read('web/test/index.html'));
  for (const targetName of ['demo-gas', 'dev-gas', 'prod-gas']) {
    assert.ok(!fs.existsSync(path.join(root, '.build', targetName, 'web', 'test')));
  }
});
