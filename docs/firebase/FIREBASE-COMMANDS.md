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
