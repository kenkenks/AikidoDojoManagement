'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('web/qr/index.html', 'utf8');
const css = fs.readFileSync('web/qr/common.css', 'utf8');

assert.match(html, /<body class="portal page-standard">/, '入口画面の既存背景と共通標準幅を適用する');
assert.match(html, /<section class="card">\s*<h2>入口<\/h2>/, '既存の入口カードと見出しを維持する');
assert.match(
  html,
  /<div class="grid entry-actions">\s*<button id="scanButton" class="entry-primary" onclick="startLoginScan\(\)">QR読み取り開始<\/button>\s*<button id="stopButton" class="entry-secondary" onclick="stopLoginScan\(\)">停止<\/button>\s*<\/div>/,
  '開始・停止ボタンを既存grid内の縦一列に配置し、ID・イベント・文言を維持する'
);
assert.match(html, /<div id="loginReader"><\/div>/, '既存のカメラ表示領域を維持する');
assert.match(html, /<button id="firebaseLoginButton" type="button" hidden>Googleでログイン<\/button>/, 'Firebaseログインボタンの構造と初期表示条件を維持する');
assert.match(html, /<section class="card" id="entryHelpCard">[\s\S]*?<h2>❓ 困ったとき<\/h2>[\s\S]*?QRコードが必要です。[\s\S]*?カメラの使用[\s\S]*?カメラの中央[\s\S]*?道場の先生に確認してください。/, 'QR利用時の案内を既存カードで表示する');
assert.match(html, /<section class="card" id="entryInformationCard">[\s\S]*?<h2>📢 ご案内<\/h2>[\s\S]*?現在は案内事項なし[\s\S]*?道場公式WEBサイト：連携予定[\s\S]*?見学・体験のご案内：連携予定/, 'リンク未確定の案内を既存カードで表示する');
const informationCard = html.match(/<section class="card" id="entryInformationCard">([\s\S]*?)<\/section>/)?.[1] || '';
assert.doesNotMatch(informationCard, /<a\b|href\s*=/, '未確定URLの外部リンクやダミーリンクを作成しない');

const scriptOrder = [
  'virtual_session.js',
  'runtime_config.js',
  'firebase_auth.js',
  'auth_gate.js'
].map(source => html.indexOf(`<script src="${source}"></script>`));
assert.ok(scriptOrder.every(index => index >= 0), '既存の認証・セッションスクリプトを読み込む');
assert.deepEqual([...scriptOrder].sort((a, b) => a - b), scriptOrder, '既存のスクリプト読み込み順を維持する');

assert.match(css, /\.portal \.entry-actions \{[^}]*margin-top:10px;/, '入口画面に限定して操作領域の余白を設定する');
assert.match(css, /\.portal \.entry-actions button \{[^}]*width:100%;[^}]*padding:14px;[^}]*border-radius:10px;/, '入口ボタンをカード幅いっぱいにしホームメニュー相当の余白と角丸を適用する');
assert.match(css, /\.portal \.entry-actions \.entry-primary \{[^}]*color:#fff;[^}]*background:var\(--teacher\);/, '開始ボタンを主操作として表示する');
assert.match(css, /\.portal \.entry-actions \.entry-secondary \{[^}]*background:#fff;/, '停止ボタンを補助操作として表示する');
assert.doesNotMatch(css, /(^|\n)\.entry-actions\s/, '入口以外へ波及する非スコープ指定を追加しない');

console.log('Entrance UI contract: PASS');
