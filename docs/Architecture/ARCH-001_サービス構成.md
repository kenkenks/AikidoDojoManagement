# ARCH-001 サービス構成

STATUS: 作成中
TYPE: ARCHITECTURE
AREA: COMMON
PRIORITY: HIGH

TAG: ARCH
TAG: SERVICE
TAG: CORE
TAG: MEMBER
TAG: TEACHER
TAG: RUNNER

---

# 1. 目的

道場システムにおけるサービス構成を定義する。

本ドキュメントでは、Story / Runner / Service / Core / Sheet の責務を整理し、今後の機能追加・リファクタリング時の基準とする。

---

# 2. 基本構成

道場システムでは、以下の構成を基本とする。

```text
Story
↓
Runner
↓
Member / Teacher Service
↓
Core
↓
Sheet

---

# 3. 各レイヤーの責務
3.1 Story

運用仕様を記述する。

対象は、先生・会員・受付担当など、実際の運用上の登場人物である。

Storyには、原則として内部関数名やシート更新処理は記述しない。

3.2 Runner

Storyを実行可能にする。

Runnerは以下の流れを基本とする。

Prepare
↓
Execute
↓
Verify
↓
Summary

Runnerは単なるテストではなく、受入試験・回帰確認・未実装検出の役割を持つ。

3.3 Member Service

会員が行う操作を担当する。

例:

会員による出席登録
会員による支払い情報入力
会員自身の状態確認
3.4 Teacher Service

先生が行う操作を担当する。

例:

出席者一覧確認
出席確認
決済確認
入金反映
3.5 Core

共通処理を担当する。

Coreは、Member / Teacher のどちらからも呼び出される処理を集約する。

例:

共通検索
共通登録
共通更新
共通検証
DTO生成
重複判定

Coreは、画面や操作主体を意識しない。

3.6 Sheet

データ永続化を担当する。

ServiceやRunnerから直接シート操作を増やさず、可能な限りCoreまたはRepository相当の共通処理を経由する。

---

# 4. 呼び出しルール
原則
Runner
↓
Member / Teacher Service
↓
Core
↓
Sheet
禁止・注意
RunnerからSheetを直接更新しない。
Member ServiceとTeacher Serviceに同じ処理を重複実装しない。
類似処理が2箇所以上に出た場合はCore抽出を検討する。
Coreは運用Storyに直接登場しない。

---

# 5. Attendanceでの適用例
STORY-001 通常出席
↓
sup_runner_Attendance.js
↓
attendanceMember...
attendanceTeacher...
↓
attendanceCore...
↓
07_出席ログ
現在の構成
04_AttendanceCore.js
    出席共通処理

04_AttendanceMember.js
    会員側出席登録

04_Attendance.js
    既存の先生側出席登録

sup_runner_Attendance.js
    STORY-001 Runner

---

# 6. 今後の方針

Attendanceをサービス構成の基準モデルとして整備する。

その後、Payment系はPayment Story作成後に、Attendanceで確立した構成を参考に段階的に整理する。

---

# 7. 関連文書
TASK-DEV-011 運用ストーリーランナー
TASK-DEV-012 Attendanceサービス構成・命名規約整理
ARCH-002 命名規約
ARCH-003 Runner設計
ARCH-004 Payment_Attendance対応表

# 8. レイヤー構成

道場システムは、以下のレイヤー構成を基本とする。

```text
Story
↓
Runner
↓
Service
↓
Business Process
↓
Core
↓
Sheet
```

|レイヤー|役割|
|---------|----|
|Story|業務仕様を定義する。|
|Runner|Storyを実行し、受入・回帰確認を行う。|
|Service|会員・先生など操作主体ごとのサービスを提供する。|
|Business Process|業務処理を段階化する（collect / make / record / post）。|
|Core|共通処理を提供する。|
|Sheet|データの永続化を担当する。|