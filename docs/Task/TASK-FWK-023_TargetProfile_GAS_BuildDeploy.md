# TASK-FWK-023 Target ProfileによるGAS Build / Deploy切替

STATUS: 実装済・確認待ち
TYPE: TASK
AREA: FRAMEWORK
PRIORITY: HIGH

TAG: FRAMEWORK
TAG: TARGET
TAG: BUILD
TAG: DEPLOY
TAG: GAS
TAG: CLASP

---

## 1. 目的

デモ・本番へのGAS配備時に、Runner / Debug / Diagnostic / Prototype等の開発支援ファイルを除外する。

Target切替のたびにRepository管理下の `.claspignore` や設定ファイルを書き換えず、Repositoryをcleanな状態のまま維持する。

## 2. 方針

「RepositoryをTarget状態へ切り替える」のではなく、「RepositoryからTarget別成果物を生成する」。

```text
Repository
   |
   +-- targets/dev-gas.json
   +-- targets/demo-gas.json
   +-- targets/prod-gas.json
   |
   +-- tools/target.mjs
          |
          v
      .build/<target>/
          |
          v
       clasp push
```

`.build/` はGit管理外とする。

## 3. Target

- `dev-gas`: GASソースを原則すべて含める。
- `demo-gas`: 運用不要なRunner / Debug / Diagnostic / Prototypeを除外する。
- `prod-gas`: 現時点ではdemo-gasと同じ除外規則とする。

`sup_config.js`、`sup_logger.js`、`sup_timeTravel.js` は名前だけで除外しない。

## 4. 使用方法

Buildのみ:

```text
npm run target:build -- demo-gas
```

Buildしてclasp push:

```text
npm run target:push -- demo-gas
```

開発GAS:

```text
npm run target:push -- dev-gas
```

## 5. Repository状態

Target選択によってTracked Fileを書き換えない。
成果物、Target用 `.clasp.json`、Build manifestは `.build/<target>/` のみに生成する。

`.clasp.json` は従来どおりGit管理外とし、push時だけ `gas/.clasp.json` またはRepository rootの `.clasp.json` をBuild成果物へコピーする。

## 6. 完了条件

- demo-gas BuildからRunner / Debug / Diagnostic / Prototypeが除外される。
- dev-gas Buildではそれらを保持できる。
- Build前後でGit管理対象ファイルが変更されない。
- `.build/<target>/` からclasp pushできる。

---

## 追加対応: 2026-09-23 デモ環境切替のツケ精算

デモ直前に手作業で行った以下の環境切替を Target Profile に回収する。

- `.clasp.json` の Script ID 直接変更
- GAS Deployment ID / Web App URL の直接変更
- 各HTMLの GAS URL 直接変更
- Runner / Debug / Diagnostic / Prototype の配備除外

### Target Profileが保持するGAS情報

- `gas.scriptId`
- `gas.deploymentId`
- Web App URL は `deploymentId` からBuild時に導出する

### Web側

HTMLは環境固有のGAS URLを保持しない。
`runtime_config.js` を介して `apiBaseUrl` を参照する。
Target Buildは `.build/<target>/web/qr/runtime_config.js` を生成する。

GitHub PagesはRepositoryの `web/qr` を直接配備せず、Target Build済みのWeb Artifactを配備する。
main push時の既定Targetは現在の試用環境に合わせ `demo-gas` とする。workflow_dispatchでは `demo-gas` / `dev-gas` を明示選択できる。

### GAS側

Target Buildは `.build/<target>/gas/.clasp.json` を生成し、Target ProfileのScript IDを使用する。
`clasp push` / `clasp deploy` はこのBuild Artifactを作業ディレクトリとして実行する。
Repository直下または `gas/` の手動 `.clasp.json` 切替には依存しない。

### 未設定Production

`prod-gas` は Script ID / Deployment ID が未定のため `null` とする。
未設定TargetのBuild / Push / Deployは明示的に失敗させ、dev/demoへの暗黙フォールバックは禁止する。

### Artifact境界

Demo / ProdではGASのRunner / Debug / Diagnostic / Prototypeを除外する。
Web Artifactでも `.skrold` と `post_diagnostic.html` を除外する。
`sup_config.js` / `sup_logger.js` / `sup_timeTravel.js` はRuntime/運用資産として除外しない。

### 完了条件（追加）

- [ ] `demo-gas` Buildの `runtime_config.js` がDemo Web App URLを指す
- [ ] `dev-gas` Buildの `runtime_config.js` がDevelopment Web App URLを指す
- [ ] Build済み `.clasp.json` がTargetごとのScript IDを持つ
- [ ] HTMLに `script.google.com/macros/s/...` の固定URLが残っていない
- [ ] `prod-gas` Buildが未設定エラーで停止する
- [ ] Demo / Prod Artifactから開発補助資産が除外される
- [ ] Target Build後もTracked Fileが変更されない
- [ ] Demo Pagesが現行デモ環境と同等に動作する
