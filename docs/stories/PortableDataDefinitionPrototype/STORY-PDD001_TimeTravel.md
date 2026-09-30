# STORY-PDD001 TimeTravel Portable Data Definition Prototype

## 1. 目的

ARCH-020 PortableDataDefinition設計の最小プロトタイプとして、Time Travelを対象にPortable Data Definitionを実装する。

同一のDefinitionからSpreadsheet / Firestore向けの構造を生成し、既存Time Travel処理を両Providerで動作させる。

---

## 2. 実施範囲

以下の最小経路を実装する。

```text
Definition
    ↓
Transform
    ↓
Create
    ↓
Deploy
    ↓
Time Travel Test
```

### Definition

Time Travelを動作させるために必要な最低限のデータ構造を定義する。

### Transform

同一Definitionから以下へ自動変換する。

* Spreadsheet
* Firestore

### Create

変換された定義から、それぞれの環境に必要なデータ構造を作成する。

### Deploy

既存Deployの仕組みを可能な限り利用・拡張し、各環境で実行可能な状態にする。

---

## 3. 完了条件

同一のDefinitionを起点として、以下が成立すること。

```text
Time Travel
   ├─ Spreadsheet → PASS
   └─ Firestore   → PASS
```

Provider固有の差異はPortable DAO以下で吸収し、Time TravelのBusiness処理をProviderごとに個別実装しない。

---

## 4. 対象外

本Storyでは以下を実装しない。

* Dictionary
* View
* Master拡張
* Documentation自動生成
* Migration
* Git Diffによる差分適用
* Lifecycle高度化
* Naming Policy高度化
* Transaction再設計
* Sync / Async再設計
* 他Entityへの展開

これらはPrototype成立後、`PortableDataDefinition` 配下の別Storyとして扱う。

---

## 5. 参照

* `ARCH-020_PortableDataDefinition設計.md`

本Storyで設計判断に迷った場合はARCH-020を優先する。
