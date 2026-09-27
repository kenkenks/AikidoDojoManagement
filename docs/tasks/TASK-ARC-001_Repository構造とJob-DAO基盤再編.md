# TASK-ARC-001 Repository構造とJob/DAO基盤再編

STATUS: 未着手
TYPE: ARCHITECTURE / REFACTORING

---

## 目的

現在の実装を基準にRepository全体を棚卸しし、不要な残骸や歴史的な配置を整理したうえで、実際の「仕事」を基準とした構造化と、GAS / Firestoreを切り替え可能なDAO基盤へ段階的に再編する。

このTaskでは、先に理想構造を固定して既存実装を押し込むのではなく、現行コードの役割・依存関係・仕事の単位を調査し、その結果から必要な構造を決める。

## 対応順

### 1. フォルダ・ファイルの整理整頓

Repository全体を対象に、フォルダ・ファイル・依存関係を棚卸しする。

- `gas/ -> src/` を候補として、参照元・build・clasp・Runner等の依存を含めて整理する。
- `web/qr/ -> web/` を候補として、Web資産の役割と参照関係を整理する。
- 不要ファイル、旧実装、移行残骸、重複、一時検証物、生成物を識別する。
- 各対象を `KEEP / MOVE / RENAME / MERGE / GENERATED / LEGACY / OBSOLETE / DELETE / UNKNOWN` 等で分類し、根拠を確認してから変更・削除する。
- Git履歴に残せば十分な過去資産は、現行treeからの削除を検討する。
- GASファイルおよびSheetの番号は単純廃止しない。プログラム上のIdentityではなく、人間向けの検索・ソートIndexとしての価値を評価する。
- Job / Toolの観点も併用し、「現ファイル -> 役割 -> 依存 -> 新配置 -> 処遇」が追える状態にする。

### 2. クラスの導入 — Job / Job Groupを意識した構造化

整理された現行実装から、実際に存在する仕事を抽出して構造化する。

仕事工程の基本候補:

```text
準備
  -> Collect
  -> Make
  -> Record   (任意)
  -> Post     (任意)
  -> 後片づけ
```

- 既存処理をJob単位で棚卸しする。
- 類似Jobを観察し、必要に応じてJob Groupを形成する。
- Job共通部分が確認できた段階で、基底クラス / Interface / Protocol等の導入を判断する。
- `Action / Business / DAO / Utility` という既存分類を、そのままクラス階層へ固定しない。
- Jobが仕事を実現するために使うものをToolとして捉え、JobとToolの境界を実装から確認する。
- 上位Jobから見ればToolである処理が、内部では小さなJobを持つ可能性も許容する。

### 3. DAO層の切り替え機構

1・2で整理した構造を前提として、Persistence Backendを切り替え可能にする。

検討対象:

- Abstract Table Definition
  - 論理Table名
  - Face / Primary Key
  - Fields / Type / Required
  - Relation
  - GAS Sheet等の物理Storage Mapping
  - Firestore Collection等の物理Storage Mapping
  - View / Projection指定
- DAO Contract
- DaoFactory
- GAS / Sheets DAO
- Firestore DAO
- build-time backend selection
- View / Projectionの定義方法

概念構造:

```text
Abstract Table Definition
          |
       DaoFactory
          |
      DAO Contract
       /        \
   GAS DAO   Firestore DAO
```

Backend切り替えは、Business側へStorage固有差分を漏らさず、build / target設定から選択できる構造を目指す。

`20_会費状態View` はView / Projection設計を具体化する実ケース候補とする。

## 依存関係

```text
1. Repositoryを整理し、現役の正本を明確にする
        ↓
2. 実際の仕事からJob / Job Group / Tool構造を抽出する
        ↓
3. 整理された構造の下へDAO切り替え機構を導入する
```

原則としてこの順序で進める。不要コードをクラス化したり、現在の歴史的構造を新DAOへ固定したりしないため、各段階の調査結果を次段階の入力とする。

## 実施方針

- 一括置換・一括移行は避け、小さな変更単位で進める。
- 各変更で既存Runner / verifierを確認する。
- 主要な節目では `runner_story_integration_902_preflight` および `runner_story_integration_902` を回帰ゲートとする。
- 設計と実コードに差異がある場合は、現行実装を調査したうえで判断する。
- Firestore実接続を急がず、まずGAS側で構造変更後の既存動作を維持する。

## 完了条件

このTaskは大項目管理用とし、実装時には必要に応じて子Taskへ分割する。

完了時には少なくとも以下を満たすこと。

- Repositoryの正本構造が明確で、不要な残骸が整理されている。
- Job / Job Group / Toolの責務が実装上説明できる。
- GAS / FirestoreのStorage差分がDAO境界へ閉じ込められている。
- Table Definitionから物理Storageを解決できる。
- View / Projectionの扱いが明示されている。
- Backendを切り替えても上位Businessの基本契約が変わらない。
- 既存の主要Story / Runnerが回帰していない。
