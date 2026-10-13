# GAS Commands

道場システムの GAS 開発環境で使用するコマンド集。
実際に開発環境で確認できた手順を記録する。
OAuth client secret の実ファイル名、client ID、秘密情報パスは Git に保存しない。

## 基本原則

GAS へのデプロイ境界は Target Profile が生成する `.build/<target>` とする。
通常の Build / Push はリポジトリルートから Target Profile 経由で行い、
`clasp run` は生成済み `.clasp.json` がある `.build/dev-gas/gas` から実行する。

```text
repository root
  ├─ npm run target:build -- dev-gas
  ├─ npm run target:push  -- dev-gas
  ↓
.build/dev-gas/gas
  └─ clasp run <runner> --user dojo-dev --json
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

## GAS 開発環境へ push

通常の Push はリポジトリルートから Target Profile 経由で行う。

```powershell
npm run target:push -- dev-gas
```

Target Profile が scriptId と Build 成果物を管理するため、通常運用では
`.build/dev-gas/gas` へ移動して直接 `clasp push` しない。


## dojo-dev OAuth 認証

`clasp run --user dojo-dev` 用の OAuth 認証。

```powershell
$creds = "<OAuth client secret JSON のローカルパス>"

clasp login --user dojo-dev `
  --creds "$creds" `
  --extra-scopes "https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/script.container.ui"
```

ブラウザで Google OAuth 認証を完了する。

## GAS 関数をリモート実行

`.build/dev-gas/gas` から実行する。

```powershell
clasp run <function-name> --user dojo-dev --json
```

Member Before Definition 取得で確認済み:

```powershell
clasp run runner_pdd_memberBefore --user dojo-dev --json
```

2026-10-06 に `01_会員マスタ` で `runner_pdd_memberBefore`、
`runner_pdd_memberMigrateHeaders` の実行を確認。
`clasp run` をリポジトリルートから実行すると `reading from storage. Error code NOT_FOUND`
となるケースがあり、`.build/dev-gas/gas` からの実行で正常動作した。

## 変更を伴う Runner の安全シーケンス

Migration など実データを変更する Runner は、Build と Push を分離して確認ゲートを置く。

```text
Build
  ↓
Build 成果物を確認
  ↓
Push
  ↓
read-only Runner で実状態確認
  ↓
write Runner
  ↓
read-only Runner で事後確認
  ↓
write Runner 再実行で冪等性確認（必要な場合）
```

Member Migration では 2026-10-06 に以下を実証済み。

- `BEFORE → AFTER`: `changed=true`
- データ行: `data_rows_unchanged=true`
- `AFTER → AFTER`: `changed=false`
- 観測 Runner: read-only


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
Target Profile の `target:push` 経路を使用する。

### 直接 `clasp push` する場合

通常運用では `npm run target:push -- dev-gas` を使用する。
`.build/dev-gas/gas` からの直接 `clasp push --user dojo-dev` は、
Target Profile 経路の切り分けなど診断が必要な場合に限定する。

```powershell
cd .build\dev-gas\gas
clasp status
clasp push --user dojo-dev
```

## 基本シーケンス

```powershell
# repository root
npm run target:build -- dev-gas

# Build 成果物を必要に応じて確認後、repository root から push
npm run target:push -- dev-gas

# remote Runner は generated .clasp.json がある Build 成果物側から実行
cd .build\dev-gas\gas
clasp run <function-name> --user dojo-dev --json
```

OAuth が必要なら push / run の前に `dojo-dev` を認証する。

## Git に保存しないもの

- OAuth client secret JSON
- OAuth client ID を含む秘密ファイル名や秘密情報パス
- access token / refresh token
- `FIRESTORE_DEV_ACCESS_TOKEN` の値
- 個人アカウント固有の認証情報


## GAS / Firestore 認証管理

### 1. 認証構成

Google Cloudプロジェクト:
- 名称: AikidoDojoManagement-Dev
- プロジェクト番号: 400662281724
- プロジェクトID: aikidodojomanagement-dev

GAS:
- 上記Google Cloudプロジェクトに関連付け済み

clasp:
- 認証プロファイル: dojo-dev
- OAuthクライアント: デスクトップアプリ用
- 使用するクライアントJSONはローカルで管理する
- JSONの実体・シークレット・トークンはGitに登録しない

OAuth公開設定:
- ユーザー種類: 外部
- 公開ステータス: テスト中（2026-10-13確認）
- リフレッシュトークンが7日間で失効する可能性あり
- invalid_grantの原因として疑われるが、未確定

### 2. GAS認証の復旧

症状:
COPY_CLASP_RUN_FAILED: invalid_grant

原因候補:
- OAuthリフレッシュトークンの失効
- OAuth認証情報の無効化

手順:

1. OAuthクライアントJSONの実際の保存先を確認する。

2. PowerShellでパスを設定する。

   $creds = '実際のOAuthクライアントJSONのフルパス'

3. ファイルの存在を確認する。

   Test-Path -LiteralPath $creds

   Trueであること。

4. 再認証する。

   clasp login --user dojo-dev --creds "$creds" --extra-scopes "https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/script.container.ui"

5. ブラウザーでGoogle認証を完了する。

注意:
- $credsはPowerShell変数であり、自動設定されない。
- 説明用の仮パスをそのまま使用しない。
- JSONの中身をログやチャットに出力しない。

### 3. Firestore認証の復旧

症状:
FIRESTORE_HTTP_401

GAS認証とは別に、Firestore REST API用の
アクセストークンを更新する。

PowerShell:

$env:FIRESTORE_DEV_ACCESS_TOKEN = (gcloud auth print-access-token).Trim()

取得確認:

[bool]$env:FIRESTORE_DEV_ACCESS_TOKEN

注意:
- clasp loginではFirestoreのアクセストークンは更新されない。
- gcloud authによってclaspのOAuth認証は更新されない。
- Trueはトークン文字列の存在確認であり、アクセス成功の保証ではない。

### 4. Member照合

プロジェクトルートから実行:

node work/gas2firebase-copy.cjs --table Member --verify-existing

動作:
1. clasp経由でGASからMemberを取得
2. Schema検証
3. Firestoreの既存データを読み取り
4. GASとFirestoreを比較

--verify-existingはFirestoreへの書き込みを行わない。

2026-10-13の確認結果:
- GAS Member取得: 24件
- Schema検証: 24件成功
- Firestore事前確認: HTTP 401で停止
- Firestore書き込み: 0件

Memberデータの一致・不一致は未判定。

### 5. エラーの切り分け

COPY_CLASP_RUN_FAILED: invalid_grant
→ clasp / GAS OAuth認証を確認

FIRESTORE_HTTP_401
→ Firestore API用アクセストークンを確認

DEP0190
→ Node.jsの非推奨API警告
→ 上記認証エラーとは別問題

### 6. 恒久対策の検討事項

- OAuthの「外部・テスト中」設定を見直す。
- dojo-devが使用するOAuthクライアントを特定する。
- 認証期限切れを事前に検出する仕組みを検討する。
- GASとFirestoreの認証確認を照合処理から分離する。

## GAS → Firestore 既存マスタの1件差分更新（2026-10-14）

`work/gas2firebase-copy.cjs` の共通更新機能を使用する。
`--only-id` は Member 専用ではなく、対応するマスタのドキュメントIDを指定できる。
Fee / Rank / Teacher で利用実績あり。マスタ専用の修復処理は作らない。

```powershell
# まず1件の差分を確認（読み取り専用）
node work/gas2firebase-copy.cjs --table Fee --plan-updates --only-id P001

# 差分とIDを確認したうえで、指定した1件だけ更新
node work/gas2firebase-copy.cjs --table Fee --apply-updates --only-id P001 --confirm dojo-management-dev
```

- `--table` と `--only-id` を変えることで Rank / Teacher にも適用する。
- `--plan-updates`（ID指定なし）でマスタ全体の差分一覧を取得できる（書き込みなし）。
- `items` の `action: "update"` と `fields` を確認し、必要なIDのみ1件更新を繰り返す。
- `--execute` は既存ドキュメントをスキップするため、内部IDフィールドの補完には使えない。
- この運用では `--apply-all-updates` に依存しない。
- ドキュメントIDそのものの変更ではなく、ドキュメント内部のIDフィールド補完。
- GASからの再取得とFirestoreへのアクセスには、それぞれ有効な認証が必要。

2026-10-14 の実績：Fee 14件（`plan_id`）、Rank 37件（`rank_id`）、
Teacher 4件（`teacher_id`）の内部IDフィールド修復をユーザーが確認。
Teacherの `会費回収可` が4件 unset だった点は、今回のID修復対象外。
