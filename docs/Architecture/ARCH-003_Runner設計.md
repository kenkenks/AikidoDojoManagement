# ARCH-003 Runner設計

STATUS: 作成中
TYPE: ARCHITECTURE
AREA: RUNNER
PRIORITY: HIGH

TAG: ARCH
TAG: RUNNER
TAG: RDD
TAG: STORY

---

# 1. 目的

本ドキュメントでは、Story Runner の設計方針を定義する。

Runnerは単なるテストコードではなく、
Storyを実行し、受入確認・回帰確認・未実装検出を行うための実行基盤とする。

---

# 2. 基本思想

Story
↓
Runner
↓
Service
↓
Core
↓
Sheet

RunnerはStoryをコードで再現する。

---

# 3. Runnerの役割

Runnerは以下を担当する。

- Story実行
- 自動テスト
- 回帰確認
- Verify
- 未実装機能検出(NEXT)
- 実行ログ出力

---

# 4. Runnerライフサイクル

Runnerは以下の順番で実行する。

```text
Prepare
↓
Execute
↓
Verify
↓
Summary
```

---

# 5. Prepare

実行前準備を行う。

例)

- Story対象データ初期化
- 出席ログ初期化
- テストデータ生成
- マスタ読込

---

# 6. Execute

StoryをStep単位で実行する。

例)

```text
Step01
Step02
Step03

・・・
```

RunnerはStoryの順番を変更してはならない。

---

# 7. Verify

Storyで期待する結果を確認する。

例)

- 登録件数
- 状態
- teacher_id
- 支払状態
- エラー有無

VerifyはStoryの受入試験を兼ねる。

---

# 8. Summary

最後に結果をまとめる。

例)

```text
total
success
failed
next
elapsed_ms
```

---

# 9. NEXT

未実装はエラーではない。

Runnerでは

```text
NEXT
```

として扱う。

例)

```text
attendanceTeacherConfirm
↓
NOT_IMPLEMENTED
↓
NEXT
```

これによりStoryを途中まで実行できる。

---

# 10. Step設計

StepはStoryと一致させる。

例)

```text
Story

Step01
↓
Runner

Step01
```

Story番号は変更しない。

---

# 11. Verify設計

Verifyは最後にまとめて行う。

例)

```text
登録件数
状態
確認待ち件数
確認済件数
```

---

# 12. ログ設計

Runnerは以下を出力する。

- Step
- 経過時間
- Message
- Success
- Failed
- NEXT

Runnerはデバッグログではなく、

運用ログ
受入ログ
回帰ログ

として利用する。

---

# 13. 今後の展開

Runnerは以下へ展開する。

- Attendance
- Payment
- Member
- Invoice
- Insurance
- Event

Storyがある機能には必ずRunnerを作成する。

---

# 14. 関連文書

ARCH-001 サービス構成
ARCH-002 命名規約
TASK-DEV-011 運用ストーリーランナー
STORY-001 通常出席
