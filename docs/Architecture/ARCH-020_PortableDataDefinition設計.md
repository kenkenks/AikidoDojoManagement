# ARCH：Portable Data Definition / Multi-Provider Data Architecture

## 1. 目的

道場システムのデータ構造を、Spreadsheet / GAS、Firestore / Firebase、将来のRDB等の特定環境に依存させず、同一の論理定義から扱える構造へ移行する。

本ARCHの中心原則は次の通りとする。

> **データの大元の定義は一つとし、各実行環境に必要な構造は、その定義からルールに従って自動生成する。**

Firestore対応そのものを目的とはしない。

Firestoreは、Portableなデータ構造が実際に異なる環境でも成立することを確認する最初の対象環境と位置付ける。

---

# 2. 背景

現在の道場システムはSpreadsheet / GASを中心として成立している。

Portable DAOの導入によりデータアクセス処理の環境依存性は分離されつつあるが、データ構造そのものが各物理環境の定義に依存したままでは、バックエンドを変更するたびに以下を個別に管理する必要が生じる。

* Spreadsheetのシート・列定義
* FirestoreのCollection / Document / Field構造
* 将来のRDBのTable / Column定義
* ソースコード上の項目定義
* 設計資料上のSchema定義

これらを個別に管理すると、時間の経過とともに定義と実体が乖離する危険性が高い。

そこで、物理環境より上位にLogical Definitionを置き、各環境の物理構造をそこから生成する。

---

# 3. 基本構造

全体の基本構造を以下とする。

```text
                 Logical Definition
                        │
                        │
                   Transform
                        │
             ┌──────────┴──────────┐
             │                     │
             ↓                     ↓
      Spreadsheet Model      Firestore Model
             │                     │
           Create                Create
             │                     │
             ↓                     ↓
        Spreadsheet            Firestore
             │                     │
             └──────────┬──────────┘
                        │
                  Portable DAO
                        │
                   Business
```

Logical DefinitionをSingle Sourceとする。

Spreadsheet用定義とFirestore用定義を、人間がそれぞれ独立して作成・維持する構造にはしない。

---

# 4. 責務

## 4.1 Definition

Definitionは、

> **「データが何者であるか」**

を定義する。

物理DBの都合は原則として含めない。

初期段階では最低限、以下を扱う。

* Entity
* Version
* Primary Key
* Field
* Logical Type
* Required等の最低限制約

例：

```yaml
entity: TimeTravel
version: "0.1"

fields:
  - name: id
    type: string
    primary_key: true
    required: true

  - name: target_at
    type: datetime
    required: true
```

これはSpreadsheet定義でもFirestore定義でもない。

**TimeTravelというデータそのものの論理定義**である。

---

## 4.2 Transform

TransformはLogical Definitionを各物理環境で扱える定義へ変換する。

```text
Logical Definition
        │
        ├──→ Spreadsheet Mapping
        │
        └──→ Firestore Mapping
```

Transformはデータの意味を新たに決定してはならない。

あくまでDefinitionで決定された意味を、それぞれの物理環境へ写像する。

---

## 4.3 Create

CreateはTransformされた定義をもとに、対象環境に必要な物理構造を生成する。

Prototype v0.1では、新規生成を対象とする。

既存データ構造との差分更新やMigrationについては、初期スコープに含めない。

---

## 4.4 Deploy

DeployはCreateされた構造および必要な実装を、対象環境で実行可能な状態へ反映する。

Deployについては既存の仕組みを可能な限り利用し、必要な対象を追加する方向で拡張する。

既存の正常なDeploy機構を、本ARCH導入のためだけに全面的に作り直さない。

---

## 4.5 Portable DAO

Portable DAOは物理環境へのデータアクセスを担当する。

Businessから見たデータの意味はProviderによって変化してはならない。

```text
Business
    │
Portable DAO
    │
    ├── Spreadsheet Provider
    └── Firestore Provider
```

理想的にはProviderの切替だけで同一Storyが成立する。

---

# 5. Prototype v0.1

最初の検証対象にはTime Travelを使用する。

Time Travelを選択する理由は、すでにPortable DAO化の実績があり、さらに日時表現という物理環境差が発生しやすいデータを含むためである。

Prototype v0.1では以下のみを実現する。

```text
Define
   ↓
Transform
   ↓
Create
   ↓
Deploy
   ↓
Test
```

成功条件は、

> **同一のLogical DefinitionからSpreadsheet環境とFirestore環境を構成し、同一のTime TravelのBusiness / Portable DAOをProvider切替によって双方で動作させること。**

最終的に、

```text
Time Travel
   ├── Spreadsheet → PASS
   └── Firestore   → PASS
```

となることをPrototype v0.1の到達点とする。

---

# 6. 回避したいこと

本ARCHは「何を実現するか」だけではなく、過去の開発経験から判明している以下の問題を回避することを重要な設計目的とする。

## 6.1 定義の二重・多重管理

Spreadsheet用、Firestore用、設計資料用などに同じ内容を個別記述しない。

```text
Definition A → Spreadsheet
Definition B → Firestore
Definition C → 設計資料
```

という構造を避ける。

原則として、

```text
                 Definition
                     │
         ┌───────────┼───────────┐
         ↓           ↓           ↓
      Sheets     Firestore      Docs
```

とする。

---

## 6.2 定義と実体の乖離

設計書を人間が更新し、DBを別途人間が変更する運用を基本としない。

転記作業によって整合性を維持するのではなく、自動変換・生成によって整合性を維持する。

---

## 6.3 物理DB仕様の論理定義への侵入

Firestoreで都合がよいから、Spreadsheetで都合がよいから、という理由だけでLogical Definitionを決定しない。

例えばLogical DefinitionにRDB固有の `VARCHAR(100)` を直接持ち込むような構造は避ける。

論理的な意味と物理表現を分離する。

---

## 6.4 日時表現の解釈差

同じ日時が、

* Spreadsheet
* JavaScript
* Firestore Timestamp
* 将来のRDB

などで異なる意味として扱われる状態を避ける。

物理的な格納形式が異なることは許容する。

ただし、Logical Definitionより上位で認識される意味が変化してはならない。

PrototypeではTime Travelを使用し、この問題を早期に実物で確認する。

---

## 6.5 ProviderごとのBusiness実装

以下のような分岐をBusinessへ拡散させない。

```text
if Firestore ...
if Spreadsheet ...
```

環境差は可能な限りTransform、Mapping、Provider、Portable DAO以下で吸収する。

---

## 6.6 プロトタイプの作り捨て

Prototype v0.1を、本番構造とは別の簡易実装として作らない。

> **簡易構造とは、最終構造とは別の構造ではなく、最終構造の最小部分である。**

Prototypeで作成したDefinition、Transform、Create等は、その後拡張して利用できることを前提とする。

---

## 6.7 最初から巨大なFrameworkを作ること

将来必要になる可能性がある機能を、Prototype v0.1ですべて実装しない。

まずTime Travel一本を通すために必要な最小構造を実装し、実際に動かした結果から次の設計を決定する。

---

## 6.8 既存の正常な仕組みの不要な再実装

Portable DAO、Runner、Deploy等、すでに正常に機能している仕組みについては、原則として再利用・拡張する。

新Architecture導入を理由に全面的な作り直しを行わない。

---

## 6.9 将来の変更を困難にする構造

Prototype v0.1ではMigrationを実装しない。

ただし、DefinitionにはVersionを持たせる。

将来的に、

```text
Definition v0.1
       ↓
Definition v0.2
       ↓
Diff
       ↓
Migration
       ↓
Test
```

へ拡張できる余地を残す。

---

## 6.10 用語の無秩序な増殖

Prototype v0.1ではKeyword Dictionary等の辞書機構は実装しない。

ただし将来的に、

* 同じ意味の用語が複数作られる
* 担当者やAIによって表現が変わる
* 定義語の意味が曖昧になる

といった問題を防ぐ必要がある。

辞書・Controlled Vocabularyは将来拡張事項として扱う。

---

# 7. Prototype v0.1で意図的に実装しないもの

以下は不要だから削除するのではなく、**現段階では実装しないもの**として明示する。

* Keyword Dictionary
* Type Dictionaryの高度化
* View Definition
* View自動生成
* Usage Metadata
* Lifecycle Policyの高度化
* Naming Policyの高度化
* 顔一覧生成
* 骨格図生成
* Schema資料自動生成
* Migration
* Git DiffによるMigration Plan生成
* Migration Fixture
* Transaction Architectureの再設計
* Sync / Async Architectureの再設計

必要性そのものを否定しない。

Time Travel Prototypeを実際に動かし、必要になったものから段階的に導入する。

---

# 8. 開発原則

本Architectureの開発は、設計をすべて完成させてから実装へ移行する方式とはしない。

```text
考える
  ↓
最小限定義する
  ↓
動かす
  ↓
問題を発見する
  ↓
Definition / Architectureを修正する
  ↓
再び動かす
```

という反復で進める。

実装はArchitectureに従う。

同時に、実装によって得られた知見をArchitectureへ戻す。

---

# 9. 将来像

Prototypeが成立した後、必要に応じてDefinitionを以下へ拡張する。

```text
Definition
   │
   ├── Schema
   ├── Master
   ├── Lifecycle
   ├── Usage
   ├── Naming Policy
   └── View
```

さらに、

```text
Definition
   ↓
Validate / Normalize
   ↓
Logical Model
   ↓
Generator / Mapper
   ├── Spreadsheet
   ├── Firestore
   ├── PostgreSQL
   ├── 顔一覧
   ├── 骨格
   └── Documentation
```

へ発展させる。

ただし、この将来像をPrototype v0.1の実装要件とはしない。

---

# 10. 判断に迷った場合の原則

今後の設計・実装で判断に迷った場合は、次の順で確認する。

1. **その情報の責務は誰にあるか**
2. **物理環境固有の事情をLogical Definitionへ持ち込んでいないか**
3. **同じ意味を二箇所以上で人間が管理しようとしていないか**
4. **自動生成できるものを手作業で同期しようとしていないか**
5. **Prototype v0.1に本当に必要か**
6. **既存の正常な仕組みを再利用できないか**
7. **将来拡張できる余地を残しつつ、今は実装しないという選択ができないか**

そして最も上位の判断基準を以下とする。

> **大元は一つ。意味は論理側に置く。物理環境の違いは下位で吸収する。必要なものは定義から生成する。**

Prototype v0.1では、この原則がTime TravelをSpreadsheetとFirestoreの双方で実際に動かせることをもって検証する。
