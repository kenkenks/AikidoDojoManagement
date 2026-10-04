# GAS Commands

道場システムの GAS 開発環境で使用するコマンド集。
実際に開発環境で確認できた手順を記録する。
OAuth client secret の実ファイル名、client ID、秘密情報パスは Git に保存しない。

## 基本原則

GAS へのデプロイ境界は `.build/<target>` とする。

```text
source
  ↓
target build
  ↓
.build/dev-gas/gas
  ↓
clasp push / clasp run
  ↓
GAS development environment
```

`gas/` 直下で Runner が clasp の追跡対象外でも、直ちに ignore 設定を変更しない。
開発ターゲットを Build し、`.build/dev-gas/gas` 側を使用する。

## dev-gas Build

リポジトリルート:

```powershell
npm run target:build -- dev-gas
```

必要な Runner が成果物へ入ったことを確認する例:

```powershell
Get-Item .build\dev-gas\gas\28_PddMemberMigrationRunner.js
```

## clasp 対象確認

```powershell
clasp status
```

## dojo-dev OAuth 認証

`clasp run --user dojo-dev` 用の OAuth 認証。

```powershell
$creds = "<OAuth client secret JSON のローカルパス>"

clasp login --user dojo-dev `
  --creds "$creds" `
  --extra-scopes "https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/script.container.ui"
```

ブラウザで Google OAuth 認証を完了する。

## GAS 開発環境へ push

```powershell
cd .build\dev-gas\gas
clasp status
clasp push --user dojo-dev
```

## GAS 関数をリモート実行

`.build/dev-gas/gas` から実行する。

```powershell
clasp run <function-name> --user dojo-dev --json
```

Member Before Definition 取得で確認済み:

```powershell
clasp run runner_pdd_memberBefore --user dojo-dev --json
```

2026-10-04 に `01_会員マスタ` の実ヘッダー取得まで正常実行を確認。

## Firestore access token

Firestore REST API 等で必要な場合:

```powershell
$env:FIRESTORE_DEV_ACCESS_TOKEN = gcloud auth print-access-token
```

これは `clasp run --user dojo-dev` の OAuth 認証とは別系統。

```text
clasp / Apps Script Execution
  → dojo-dev OAuth credentials

Firestore REST access
  → FIRESTORE_DEV_ACCESS_TOKEN
```

## トラブルシュート

### `reading from storage. Error code NOT_FOUND`

まず実行ディレクトリを確認する。

```powershell
cd .build\dev-gas\gas
```

このプロジェクトの開発用 `clasp run` は Build 成果物側から実行する。

### `Unable to run script function`

```text
Unable to run script function.
Please make sure you have permission to run the script function.
```

`--user dojo-dev` の OAuth 認証と scope を確認する。必要なら上記の
`clasp login --user dojo-dev --creds ... --extra-scopes ...` で再認証する。

### Runner が push されない

source の `gas/` で Runner が `Untracked files` になる場合がある。
Runnerを直接追跡対象へ変更する前に、`dev-gas` を Build して
`.build/dev-gas/gas` 側から push する既存経路を使用する。

## 基本シーケンス

```powershell
# repository root
npm run target:build -- dev-gas

# deployment boundary
cd .build\dev-gas\gas

clasp status
clasp push --user dojo-dev
clasp run <function-name> --user dojo-dev --json
```

OAuth が必要なら push / run の前に `dojo-dev` を認証する。

## Git に保存しないもの

- OAuth client secret JSON
- OAuth client ID を含む秘密ファイル名や秘密情報パス
- access token / refresh token
- `FIRESTORE_DEV_ACCESS_TOKEN` の値
- 個人アカウント固有の認証情報
