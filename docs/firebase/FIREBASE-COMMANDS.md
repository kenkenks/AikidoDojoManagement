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

## 3. Schema / Target Build

``` powershell
# スキーマ定義を整備
npm run schema:build

# DEV向けのWeb/API配信成果物を生成
npm run target:build -- dev-firebase
```

既存の配信用worktreeで実行する場合は、対象コミットと `git status --short` を先に確認する。既存 `.build` は別コミット由来の可能性があるため、配信前に再生成する。

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

## 6. Firebase Hosting deploy（DEV）

実運用で使用している入口:

``` powershell
# 先に第3章のschema/buildと第4章のWeb verifierを実行する
npm run target:push -- dev-firebase
```

`target:push` が配信する対象・プロジェクト・ファイル範囲は、実行前に `tools/target.mjs` と `targets/dev-firebase.json` で確認する。コマンド集の記載だけでCLI内部処理の同一性は保証しない。

Firebase CLIによる既存の直接配信手順（代替。どちらか一方を使用）:

``` powershell
Push-Location .build/dev-firebase/web
try {
  firebase deploy --only hosting --project dojo-management-dev
} finally {
  Pop-Location
}
```

Webの更新はCloud Runの必要なAPIが配信・検証された後に行う。`target:push` と直接配信を連続実行しない。

## 7. Cloud Run deploy（DEV・段階的切替）

**標準運用:** `--no-traffic` で候補リビジョンを作成 → 候補検証 → 明示的に100%切替。以下は `dojo-management-dev` のDEV専用手順。

### 7.1 候補リビジョンをデプロイ（トラフィック0%）

``` powershell
# 先に第3章のschema/buildと第5章のAPI verifierを実行する
gcloud run deploy dojo-time-travel-admin `
  --source .build/dev-firebase/cloud-run/dojo-time-travel-admin `
  --project dojo-management-dev `
  --region asia-northeast1 `
  --no-traffic
```

デプロイ結果の**実際のリビジョン名**（例: `dojo-time-travel-admin-00024-728`）を控える。番号・末尾は毎回変わる。`--no-traffic` は新リビジョンへの通常トラフィックを0%にする指定であり、候補URLのアクセス制御そのものではない。既存サービス設定（認証・リソース等）を勝手に変更しない。

### 7.2 候補を確認

``` powershell
# リビジョン名・トラフィック状態・候補URLを確認
gcloud run services describe dojo-time-travel-admin `
  --project dojo-management-dev `
  --region asia-northeast1 `
  --format="yaml(status.latestCreatedRevisionName,status.latestReadyRevisionName,status.traffic)"
```

候補URLの診断エンドポイント、認証必須APIの401/403、権限を持つ利用者による正常系、Cloud Runログを確認する。診断用の `/hello` が成功しても業務APIの正常動作を証明したことにはならない。候補リビジョンがReadyであること、旧リビジョンに通常トラフィックが流れていることも確認する。

### 7.3 検証後にトラフィック切替

``` powershell
# 例の値をコピーせず、7.1の出力にある実際のリビジョン名を入力
$revision = "dojo-time-travel-admin-00024-728"

gcloud run services update-traffic dojo-time-travel-admin `
  --to-revisions "${revision}=100" `
  --project dojo-management-dev `
  --region asia-northeast1

# 切替結果を確認
gcloud run services describe dojo-time-travel-admin `
  --project dojo-management-dev `
  --region asia-northeast1 `
  --format="yaml(status.traffic)"
```

**注意:** リビジョン名に `-admin` を余分に挿入しない。必ず実際のデプロイ出力に合わせる。切替前のリビジョン名も控え、問題発生時は同じ `update-traffic` コマンドで旧リビジョンに戻す。

### 7.4 旧手順（即時トラフィック切替・通常は使わない）

``` powershell
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

この方式は候補検証前に通常トラフィックが切り替わるため、標準手順にはしない。`--allow-unauthenticated` はBrowserからの到達性のためのインフラ設定であり、保護APIではFirebase ID Token / roleをアプリ側で検証する。`/hello` は診断用public endpoint。

### 7.5 Cloud Runログ調査

``` powershell
# 実際の対象リビジョン名に変更する
$revision = "dojo-time-travel-admin-00021-5lv"

# 特定エラーを検索
gcloud logging read `
  "resource.type="cloud_run_revision" AND resource.labels.revision_name="$revision" AND textPayload:"MEMBER_STATE_ERROR"" `
  --project dojo-management-dev `
  --limit 10 `
  --format="table(timestamp,textPayload)"

# stderrの内容を確認
gcloud logging read `
  "resource.type="cloud_run_revision" AND resource.labels.revision_name="$revision" AND logName="projects/dojo-management-dev/logs/run.googleapis.com%2Fstderr"" `
  --project dojo-management-dev `
  --limit 30 `
  --order asc `
  --format="value(textPayload)"
```

PowerShellの引用符が問題になる場合は、元の運用コマンドのようにフィルタ全体をシングルクォートで囲み、リビジョン名を直接記入する。

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
