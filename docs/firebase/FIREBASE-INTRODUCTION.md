# Firebase導入ガイド（道場システム）

## 1. 目的

本書は、道場システムをGAS単独構成からFirebase/Google
Cloudを利用できる構成へ拡張する際の導入事項を整理する。
一般的なFirebase入門ではなく、`dojo-management-dev` と TimeTrip
で実際に縦断確認した構成を基準とする。

## 2. 実証済みの縦断

``` text
Firebase Hosting Web
  ↓
Firebase Authentication
  ↓ Firebase ID Token
Cloud Run: Dojo API Server
  ↓
Application/Core
  ↓
Business DAO
  ↓
Firestore Core
  ↓
Cloud Firestore
```

TimeTripでは、GET、POST ON、再GET、POST
OFF、再GET、F5後の認証セッション復元、通常キャッシュ条件での往復まで実機確認済み。

## 3. 導入時に用意するもの

### Firebase / Google Cloud

-   Firebase Project
-   Billing Accountとの関連付け（Blaze）
-   Firebase Authentication
-   Cloud Firestore
-   Firebase Hosting
-   Cloud Run
-   Cloud Build
-   Artifact Registry
-   Cloud Run実行用Service Account / ADC
-   必要なGoogle Cloud API

### リポジトリ

-   `targets/dev-firebase.json`
-   `tools/target.mjs`
-   Firebase Web runtime config
-   Firebase Auth client
-   Dojo API client
-   Cloud Run API server
-   Firestore Core
-   target-specific `.build` 成果物

## 4. 開発環境と本番環境

命名は `<system>-<environment>` を基本とする。

``` text
dojo-management-dev
dojo-management-stg   （必要になった場合）
dojo-management-prod
```

devとprodを同一Projectに混在させない。Firebase Project
IDは後から気軽に変更する対象ではないため、環境名を含めて最初に決める。

## 5. 認証は2種類ある

### 利用者の認証

``` text
利用者
 ↓
Firebase Auth
 ↓
Firebase ID Token
 ↓
Dojo API Server
```

### サーバー自身の認証

``` text
Cloud Run / local server
 ↓
Service Account / ADC
 ↓
Google Access Token
 ↓
Firestore
```

この2つを混同しない。ローカル開発では
`gcloud auth application-default login`、Cloud Runでは実行Service
Accountを使用する。

## 6. Deployment Boundary

Repository rootをそのままデプロイしない。

``` text
common source
 ↓
npm run target:build -- dev-firebase
 ↓
.build/dev-firebase/
 ├─ web/        Firebase Hosting deploy unit
 └─ cloud-run/  Cloud Run deploy unit
```

`.build` を「開発ソース」と「環境別デプロイ成果物」の正式な境界とする。

## 7. 導入時の主な注意点

-   Browser → Cloud Runで `Authorization` を送るとCORS
    preflightが発生する。
-   `OPTIONS` はFirebase ID Token検証より前に処理する。
-   実リクエストにも `Access-Control-Allow-Origin` が必要。
-   Originは `*` ではなく許可Hosting Originを限定する。
-   Firebase ID Tokenの更新はWeb SDKへ任せ、refresh
    tokenを独自管理しない。
-   Hostingのキャッシュ制御をdevで明示する。
-   Cloud Run IAM認証とFirebase Authによるアプリ認証は別物。
-   FirestoreへのアクセスはApplication/Core→Business DAO→Firestore
    Coreの既存境界を維持する。

## 8. 公式資料

-   Firebase pricing: https://firebase.google.com/pricing
-   Firebase Auth persistence:
    https://firebase.google.com/docs/auth/web/auth-state-persistence
-   Firestore pricing:
    https://firebase.google.com/docs/firestore/pricing
-   Cloud Run overview:
    https://cloud.google.com/run/docs/overview/what-is-cloud-run
