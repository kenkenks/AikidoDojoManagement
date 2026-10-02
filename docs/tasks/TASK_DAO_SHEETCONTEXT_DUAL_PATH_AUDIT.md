# TASK: DAO / SheetContext 二重化調査とBackend別I/F再検討

## 1. 現状フロー — 最重要

調査時点では、データアクセス経路は単一化されておらず、旧来のSheetContextアクセッサ系とDAO系が部分的に併存している。

```text
                         現行

              ┌─ 旧SheetContext accessor
              │
              │   getMembers(ctx)
              │   getTrainingSlots(ctx)
              │   getAttendances(ctx)
              │          │
Business ─────┤          └──────────────┐
              │                         │
              │                         ▼
              │                    SheetContext
              │                    getSheetRows()
              │                         │
              │                         ▼
              │                        CTX
              │
              ├─ GAS DAO Business
              │   DAO_Business_Attendance
              │   DAO_Business_Billing
              │          │
              │          ▼
              │     DAO_Core_Sheets
              │          │
              │          ▼
              │     SheetContext
              │     getSheetRows()
              │          │
              │          ▼
              │         CTX
              │
              └─ Portable系
                  shared/DAO_Business
                         │
                         ▼
                    Adapter DAO Core
                    ┌──────┴──────┐
                    ▼             ▼
                   GAS        Firestore
```

したがって現状は、

```text
旧アクセッサをDAOへ完全置換した
```

のではなく、

```text
旧アクセッサ経路
      ＋
GAS DAO経路
      ＋
Portable DAO系
```

が部分的に共存している状態と考えられる。

特にGAS側では、同じ物理データへの入口が二つ存在する。

```text
getMembers(ctx)
      │
      └─ "01_会員マスタ"
               │
               ▼
          getSheetRows()


DAO_Core.read("members")
      │
      └─ "01_会員マスタ"
               │
               ▼
          getSheetRows()
```

論理名から物理Sheet名への対応も複数箇所に存在する。

---

## 2. 調査で確認できた事実

* `getMembers(ctx)`、`getTrainingSlots(ctx)` 等の旧来SheetContextアクセッサは現在も本番コードから直接利用されている。
* Attendanceには別途、

```text
DAO_Business_Attendance
        ↓
DAO_Core_Sheets
        ↓
SheetContext
```

の経路が存在する。

* したがってデータアクセス経路は部分的に二重化している。
* 論理名→物理Sheet名の対応も旧アクセッサとDAO_Core_Sheets側に重複している。
* DAO_Businessには単純ラッパーだけではなく、find系など業務的意味を持つアクセッサが存在する。
* `daoAttendanceGetSlotMap_()` のように、GASで有効なMap表現がDAO Business I/Fへ露出している箇所がある。
* Portable系として `shared/DAO_Business.js` とGAS/FirestoreのDAO Core Adapterも存在する。

---

## 3. 現時点の推定

DAO Businessという境界そのものには存在価値がある可能性が高い。

理想的にはDAO Businessは、

```text
findMemberById()
findTrainingSlotById()
findActiveTrainingSlots()
findInvoicePayments()
```

など、

```text
「どう取得するか」ではなく
「何を取得したいか」
```

を外部へ提供する層と考えられる。

一方、

```text
getMembers()
getTrainingSlots()
GetSlotMap()
```

などにはGASの、

```text
Sheet一括read
    ↓
rows
    ↓
メモリ検索
    ↓
必要ならMap/Index
```

というアクセス戦略が反映されている可能性がある。

Mapは共通DAO I/Fではなく、必要ならGAS CTX内部のIndexとして保持する方が自然と思われる。

---

## 4. Backend別アクセス戦略の推定

同じBusiness要求でも、Backendごとに最適な実装は異なる。

```text
                 DAO Business
                       │
                 findMemberById()
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
         GAS        Firestore       RDB
          │            │            │
     CTX内を検索    Document/Query   SQL
          │            │            │
     rows / Map       Index        PK/Index
```

CTXはコンテナーであり、Backend間で中身を統一する必要はない。

```text
GAS CTX
  rows
  cache
  必要ならMap

Firestore CTX
  db
  collection/ref
  transaction等

RDB CTX
  connection
  transaction等
```

---

## 5. getMembers(ctx) に関する推定

GASでは `getMembers(ctx)` に、

```text
Sheetを一括read
    ↓
rowsを取得
    ↓
CTX/cacheで再利用
```

という意味がある。

しかしFirestore主体の場合、

```text
getMembers(ctx)
    ↓
事前全件ロード不要
    ↓
no-opになる可能性
```

がある。

実際の検索は、

```text
findMemberById(ctx, memberId)
```

などが呼ばれた時点でFirestore Query/Document取得を行う方が自然な可能性がある。

これは現時点では**推定であり未確定**。

重要なのは、

```text
同じI/F
   ≠
同じデータアクセス戦略
```

という点。

あるBackendで必要なpreloadが、別Backendではno-opであってもよい可能性がある。

---

## 6. 将来検討

* DAO Businessの公開I/Fを `find...` 等の意味中心へ整理できるか。
* `getMembers()` / `getTrainingSlots()` 等のGAS固有preloadをCTX初期化内部へ移せるか。
* Map生成をGAS CTX内部のIndexへ移せるか。
* `init(Member, Attendance, TrainingSlot, ...)` のような必要Entity宣言型preloadが適切か。
* FirestoreではDocument/Query/Indexを自然に利用する。
* RDBではSQL/PK/Indexを自然に利用する。
* DAO_CoreをBackend間でどこまで共通化する必要があるか再評価する。
* 論理名→物理Sheet名マッピングの二重管理を将来解消する。

---

## 7. 現在の判断

**修正しない。**

現状は `PARTIAL` な二重化が存在すると判断する。

ただしDAO Businessには有用な責務が存在する可能性が高く、現時点で削除・統合・I/F変更は行わない。

Firestore実装を進め、実際のBackend別アクセスパターンが明確になった段階で本TASKを再開する。

その時点で、調査結果と推定を再検証し、確定した設計知識のみARCHへ反映する。
