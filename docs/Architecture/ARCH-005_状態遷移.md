# ARCH-005 状態遷移

STATUS: 作成中
TYPE: ARCHITECTURE
AREA: STATE
PRIORITY: HIGH

TAG: ARCH
TAG: STATE
TAG: ATTENDANCE
TAG: STATUS

---

# 1. 目的

本ドキュメントでは、道場システムで利用する状態(Status)の定義および状態遷移を管理する。

状態遷移を統一することで、

- Story
- Runner
- Service
- Core

で同じ意味の状態を利用できるようにする。

---

# 2. 基本方針

状態(Status)は業務状態を表す。

画面表示や内部処理によって状態名を変更しない。

---

# 3. Attendance状態

## 状態一覧

|Status|説明|
|-------|----|
|確認待ち|会員がセルフ登録を完了した状態|
|確認済|先生が出席を確認した状態|
|取消|先生または運営が取消した状態|

---

# 4. 状態遷移

```text
（初期）

↓

確認待ち

↓

確認済

↓

取消
```

---

# 5. STORY-001対応

|Story|Status|
|------|------|
|Step04|確認待ち|
|Step06|確認済|

---

# 6. 状態更新

## 会員

```text
確認待ち
```

まで更新可能。

---

## 先生

```text
確認待ち

↓

確認済

↓

取消
```

を更新可能。

---

# 7. 更新責務

|状態|更新主体|
|------|---------|
|確認待ち|Member Service|
|確認済|Teacher Service|
|取消|Teacher Service|

---

# 8. Runner確認

Runnerでは以下を確認する。

- 確認待ち件数
- 確認済件数
- teacher_id
- 更新日時

---

# 9. 今後追加予定

Attendance

- 保留
- エラー

Payment

- 未払い
- 支払待ち
- 入金済
- キャンセル

Insurance

- 未加入
- 加入済

Event

- 申込
- 受付
- 完了

---

# 10. 関連文書

ARCH-001 サービス構成

ARCH-003 Runner設計

STORY-001 通常出席


UI Rule

・画面は業務ルールを持たない
・画面は入力と表示のみ
・日時・対象月・締め・判定はServiceが決定
・画面は必要最小限のパラメータのみ送る