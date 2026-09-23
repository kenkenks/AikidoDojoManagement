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
