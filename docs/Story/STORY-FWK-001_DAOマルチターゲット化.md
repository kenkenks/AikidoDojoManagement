# STORY-FWK-001 DAO Business / DAO Core マルチターゲット化

STATUS: 作成予定
TYPE: STORY
AREA: FRAMEWORK
PRIORITY: HIGH

TAG: FRAMEWORK
TAG: DAO
TAG: MULTI_TARGET
TAG: GAS
TAG: GOOGLE_CLOUD
TAG: PORTABILITY

---

## 1. 目的

DAOを Business Layer と Core に分離し、Application / Service / Workflowを実行基盤・永続化基盤から独立させる。

GASからGoogle Cloudへ一方向に置換するのではなく、同一Applicationを複数Targetで動作可能にする。
新規開発した機能をGoogle CloudだけでなくGASでも同じ業務仕様・Contractで利用できるFrameworkを目指す。

## 2. 基本構造

```text
Application / Service / Workflow
              |
              v
       DAO Business Layer
              |
              v
         DAO Core Port
          /        \
         v          v
 GAS / Sheets    Google Cloud
   DAO Core        DAO Core
```

DAO Business Layerは業務データの意味と操作を扱い、保存先を原則として知らない。
DAO Coreは read / write / query / batch / transaction / key handling 等の物理アクセス能力を提供し、基盤固有差を閉じ込める。

## 3. TargetによるDAO Core選択

概念例:

```yaml
target: gas
dao:
  core: sheets
```

```yaml
target: google-cloud
dao:
  core: firestore
```

将来はPostgreSQL等のCore追加も許容する。
DAO Business内に環境分岐を散在させず、Target解決は起動・Composition境界で行う。

## 4. Framework指向

本Storyは単なるGAS脱却ではない。
UnityのBuild Targetに近い考え方で、同一Applicationを異なる実行基盤へ載せられる構造を目指す。

```text
Application
    |
Framework
    |
    +-- Target: GAS
    |      +-- Sheets DAO Core
    |
    +-- Target: Google Cloud
           +-- Cloud DAO Core
```

Google Cloudを今後の主開発Targetとしつつ、GASも正式なTargetとして維持できる構造を目指す。
最小公倍数化を避けるため、必要に応じて共通Core APIとTarget固有Capabilityを分ける。

## 5. 最初の実施範囲

1. 現行コードのデータアクセス経路を棚卸しする。
2. 業務処理からのSpreadsheet直接依存を特定する。
3. DAO Business Layerの責務境界を整理する。
4. DAO Core Portを定義する。
5. 現行SheetsアクセスをGAS / Sheets DAO Coreへ集約する。
6. 現行GAS動作・既存Contract / RunnerをGREENに保つ。
7. Target定義からDAO Coreを解決できる構造にする。
8. その後、2つ目のDAO CoreとしてGoogle Cloud側を実装する。

## 6. 設計原則

- 業務ロジックから物理ストレージAPIを直接呼ばない。
- DAO Businessは業務責務単位で整理する。
- DAO Coreを巨大な業務DAOにしない。
- Target固有処理をApplicationへ漏らさない。
- 新規機能の業務ロジックをGAS版・Cloud版で二重実装しない。
- 同一Contract Testを複数Targetで利用できる構造を目指す。

## 7. 将来展開

DAO CoreでTarget方式を実証後、Clock、Logger / Observability、Configuration、Session / Runtime、Secret、Event / Queue等へ同じ方式を展開する候補とする。

## 8. 完了条件

- Application / Serviceから基盤固有のデータアクセス依存が排除されている。
- DAO BusinessとDAO Coreの責務が文書・コード双方で識別できる。
- GAS / Sheets DAO Coreで既存機能がGREENである。
- Target定義によってDAO Coreを選択できる。
- Google Cloud DAO Coreを追加してもDAO Businessの業務ロジックを複製しない構造になっている。
