# Firebase開発・運用コマンド集（PowerShell）

## 1. まず何をしたいか

``` text
Webだけ変更            → target build → Web verifier → Hosting deploy
Cloud Runだけ変更      → target build → API verifier → Cloud Run deploy
target設定変更         → target build → Hosting/Cloud Run両成果物確認
認証がおかしい         → Firebase Auth / Network / token確認
Browserだけ失敗        → CORS / cache / Network確認
Firestore接続失敗      → ADC / project / server identity確認
一区切り               → tests → git status → commit → push
```

## 2. Git

``` powershell
git status
git diff --check
git log --oneline -10
git push
```

## 3. Target Build

``` powershell
npm run target:build -- dev-firebase
```

成果物:

``` text
.build/dev-firebase/web/
.build/dev-firebase/cloud-run/
```

## 4. Firebase Web / Auth verifier

``` powershell
node --test work/verify-firebase-auth-client.mjs
node --test work/verify-dojo-api-client.mjs
node --test work/verify-firebase-web-runtime-config.cjs
node --test work/verify-firebase-hosting-deploy-unit.cjs
node --test work/verify-time-travel-firebase-get.mjs
```

## 5. Cloud Run / TimeTrip verifier

``` powershell
node --test work/verify-admin-time-travel-api.cjs
node --test work/verify-admin-time-travel-server.cjs
node --test work/verify-firebase-target-deploy-unit.cjs
node --test work/verify-time-travel-firestore-composition.cjs
```

## 6. Firebase Hosting deploy

``` powershell
npm run target:build -- dev-firebase

Push-Location .build/dev-firebase/web
firebase deploy --only hosting --project dojo-management-dev
Pop-Location
```

## 7. Cloud Run deploy

``` powershell
npm run target:build -- dev-firebase

gcloud run deploy dojo-time-travel-admin `
  --source .build/dev-firebase/cloud-run/dojo-time-travel-admin `
  --project dojo-management-dev `
  --region asia-northeast1 `
  --allow-unauthenticated `
  --min 0 `
  --max 1 `
  --cpu 1 `
  --memory 512Mi `
  --concurrency 8
```

Cloud Runをinfra上 `--allow-unauthenticated`
にしているのはBrowserから到達可能にするため。保護APIはApplication側でFirebase
ID Token / roleを検証する。`/hello` は診断用public endpoint。

## 8. Google Cloud / Firebase login

### CLI user login

``` powershell
gcloud auth login
firebase login
```

### ローカルserver用ADC

``` powershell
gcloud auth application-default login
```

### 現在のGoogle access token確認

``` powershell
gcloud auth print-access-token
```

これはFirebase end-user ID Tokenとは別物。

## 9. Browser正常系の目安

### GET

``` text
OPTIONS /api/...   204
GET     /api/...   200
```

### POST

``` text
OPTIONS /api/...   204
POST    /api/...   200
GET     /api/...   200   ← 保存後の再確認
```

## 10. 障害切り分け早見

``` text
OPTIONS 401/403
  → CORS / OPTIONSがAuthより前か、Origin許可を確認

GET 401
  → Firebase ID Token / currentUser / Authorization

GET 403
  → role / admin claim / API authorization

GET/POST 5xx
  → Cloud Run log / Application/Core / Firestore / ADC

POST 200だが値が違う
  → Application / DAO / data mapping

Webだけ古い
  → Hosting deploy unit / Cache-Control / browser cache

local serverだけFirestore失敗
  → gcloud auth application-default login / project確認
```

## 11. Devブラウザ確認

デプロイ直後の厳密な確認: 1. DevTools → Network 2. `Disable cache` ON 3.
Ctrl+R 4. API正常確認 5. `Disable cache` OFF 6. F5 7.
通常キャッシュ条件でも再確認

dev HostingではHTML `no-cache`、JS `no-store` を採用している。

## 12. Firestore Member Migration（development proof document）

Member Migration の実環境確認は、`dojo-management-dev / members / TEST_MEMBER_001`
だけを対象に、次の順序で行う。

### 12.1 Access token

``` powershell
$env:FIRESTORE_DEV_ACCESS_TOKEN = gcloud auth print-access-token
```

`FIRESTORE_HTTP_401` の場合は、まず access token を再取得してから再実行する。

### 12.2 現在値の read-only 確認

``` powershell
node work/read-member-firestore-real.cjs TEST_MEMBER_001
```

書込みは行わない。Migration 前は `LEGACY_OBSERVED`、Migration 後は
`AFTER_COMPATIBLE` であることを確認する。

### 12.3 read-only dry-run

``` powershell
node work/dry-run-member-firestore-migration-real.cjs TEST_MEMBER_001
```

Migration 前の期待値:

``` text
action      = MIGRATE
schemaState = LEGACY_OBSERVED
documentId  = TEST_MEMBER_001
```

この段階では `replaceByKey` を呼ばず、Firestore を変更しない。

### 12.4 real migration + post-check

dry-run の結果を確認してから、1回だけ実行する。

``` powershell
node work/apply-member-firestore-migration-real.cjs TEST_MEMBER_001
```

初回の期待値:

``` text
ok          = true
action      = MIGRATE
schemaState = LEGACY_OBSERVED
afterState  = AFTER_COMPATIBLE
```

この入口は `dev-firebase / dojo-management-dev / members / TEST_MEMBER_001`
に限定されている。実行内部は `read → plan → document identity check →
replaceByKey → re-read → AFTER_COMPATIBLE post-check` の順で行う。

### 12.5 idempotency

初回の real migration と post-check が成功した後、同じコマンドをもう一度実行する。

``` powershell
node work/apply-member-firestore-migration-real.cjs TEST_MEMBER_001
```

2回目の期待値:

``` text
ok          = true
action      = NO_OP
schemaState = AFTER_COMPATIBLE
```

`NO_OP` の場合は `replaceByKey` に到達せず、追加writeを行わない。

### 12.6 Safety sequence

``` text
access token
    ↓
read-only current-state check
    ↓
read-only dry-run
    ↓
real migration
    ↓
post-check
    ↓
idempotency rerun (NO_OP)
```

実データ変更を伴う確認では、この順序を崩さない。
