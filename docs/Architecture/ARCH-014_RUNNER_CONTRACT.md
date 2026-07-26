# ARCH-014 Runner契約・入口パターン設計

STATUS: ACTIVE
TYPE: ARCHITECTURE
AREA: RUNNER
PRIORITY: HIGH

TAG: ARCH
TAG: RUNNER
TAG: CONTRACT
TAG: ENTRY_PATTERN
TAG: STORY
TAG: PAYMENT

---

# 1. 目的

Runnerを単なる内部関数の動作確認ではなく、
実際の業務入口から期待状態までを保証する実行可能な契約として定義する。

本規約は、現金受付フローの実証で確認された知見を一般化したものである。

---

# 2. 基本原則

```text
ARCH
↓
Runner Contract
↓
Implementation
↓
View
```

ARCHは設計原則を定義する。

Runnerは、その原則を具体的な入力・状態・出力として実行可能にする。

ImplementationとViewはRunner Contractを満たす手段であり、
実装方式そのものを契約として固定しない。

---

# 3. Runner Contract

Runner Contractは、少なくとも次を明示する。

- 入口
- 入力パターン
- 実行主体
- 許可される状態遷移
- 入口直後の期待状態
- 次の責務へ渡す境界
- 禁止される副作用

例：現金受付

```text
入口
payment_batch

入力
payment_method = CASH
evidence_code = なし

状態遷移
REQUESTED
↓
CONFIRMED

境界
先生画面の決済更新待ち

禁止
受付処理内でPOSTEDへ進めない
06_入金ログを作成しない
```

---

# 4. 内部APIパターンと入口パターン

Runnerは次の二種類を区別する。

## 4.1 内部APIパターン

個別Business Processや状態遷移部品を確認する。

```text
Request
↓
Record
↓
Post
```

内部APIパターンは、各処理が組み合わせ可能であることを保証する。

## 4.2 入口パターン

実画面または外部入口と同じデータ形状でBusiness Processを開始する。

```text
Browser Entry
↓
payment_batch
↓
acceptBatch
↓
Expected Boundary State
```

入口パターンは、利用経路が不要な後続処理まで実行しないことも保証する。

内部APIパターンがPASSしていても、入口パターンの保証にはならない。
両方を持つこと。

---

# 5. 責務境界の検証

Runnerは、処理が成功したことだけでなく、
次の責務へ越境していないことを検証する。

代表的なVerify：

- 期待状態に到達している
- 次状態へ進んでいない
- 後続ログが作成されていない
- 後続IDが空である
- 次の実行主体を待つ状態である

現金受付の例：

```text
status = CONFIRMED
payment_count = 0
payment_log_id = empty
postResult = null
```

---

# 6. FAILからの修正規則

Runner Contractが業務仕様と一致している場合、
実装はRunnerをPASSさせるように修正する。

```text
Runner FAIL
↓
破られた契約を確認
↓
最小修正
↓
同一Runnerを再実行
↓
Runner PASS
↓
回帰Runner
```

Runnerを実装に合わせて変更してはならない。
業務仕様が変更された場合のみ、ARCH・Story・Runnerを順に更新する。

---

# 7. 実証済みパターン

## CASH_PAYMENT_BATCH_WITHOUT_EVIDENCE_CODE

```text
payment_batch
↓
REQUESTED
↓
CONFIRMED
↓
先生選択・決済更新
↓
POSTED
```

受付直後の契約：

- payment_method = CASH
- status = CONFIRMED
- postResult = null
- 06_入金ログ = 0件
- payment_log_id = 空

この契約は `runner_payment_story_p005_cash_entry()` で保証する。

---

# 8. パターン追加規則

Business Processに複数の利用入口がある場合、
代表的な入口パターンをRunnerへ追加する。

例：

- 現金単一請求
- PayPay単一請求
- 現金＋審査費
- PayPay＋審査費
- 複数請求
- 未払い混在

関数網羅ではなく、業務上意味のある入力パターンを優先する。

---

# 9. 完了条件

入口パターンの変更は次を満たした時点で完了とする。

```text
対象Runner PASS
↓
Main Story Runner PASS
↓
Integration Runner PASS
↓
必要な実画面確認 PASS
```

対象RunnerだけのPASSでは完了としない。

---

# 10. 関連文書

- ARCH-003 Runner設計
- ARCH-005 状態遷移
- ARCH-006 Business Process標準モデル
- ARCH-007 Main Story設計
- TASK-DEV-019 現金受付・入金反映
