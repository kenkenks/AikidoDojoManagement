# TASK-DEV-012 サービス構成・命名規約統一

STATUS: 作成中
TYPE: TASK
AREA: ARCHITECTURE
PRIORITY: HIGH

TAG: TASK
TAG: ARCHITECTURE
TAG: NAMING
TAG: SERVICE
TAG: RDD

---

# 1. 目的

サービス構成および関数命名規約を統一する。

現在は開発初期段階のため、Attendance・Paymentを中心に、
処理単位や命名方法が混在している。

本タスクでは、今後の保守性・可読性・再利用性を高めるため、
サービス構成および命名規約を整理する。

---

# 2. 背景

STORY-001実装時に以下の課題が確認された。

- Attendance と AttendanceMember に似た処理が存在する。
- 共通処理(Core)へ抽出できる処理が多い。
- Self / Member など命名が混在している。
- Payment と Attendance の命名規約が一致していない。

このまま機能追加を続けると、
似て非なる処理が増え、保守性が低下する。

---

# 3. サービス構成方針

各業務は以下の構成を基本とする。

Core
    共通処理

Member
    会員操作

Teacher
    先生操作

Runner
    Story実行

Story
    業務仕様

---

# 4. Coreの役割

Coreは業務共通処理のみを保持する。

例)

- 共通検索
- 共通登録
- 共通更新
- 共通検証
- 共通DTO生成

Coreは画面や利用者を意識しない。

---

# 5. Memberの役割

会員が利用するサービスを担当する。

例)

- 出席登録
- 支払い登録
- 支払い確認
- 出席状態取得

---

# 6. Teacherの役割

先生が利用するサービスを担当する。

例)

- 出席確認
- 出席取消
- 支払い確認
- 入金確定

---

# 7. Runnerの役割

Storyを自動実行する。

Runnerは以下の構成を基本とする。

Prepare

↓

Execute

↓

Verify

↓

Summary

---

# 8. 命名規約

現在は以下を検討対象とする。

サービス

attendanceCore

attendanceMember

attendanceTeacher

paymentCore

paymentMember

paymentTeacher

関数

<サービス><処理>

例)

attendanceMemberRegister()

attendanceTeacherConfirm()

paymentMemberAccept()

---

# 9. 業務処理規約

業務処理は以下の段階を基本とする。

collect

↓

make

↓

record

↓

post

※適用範囲は今後整理する。

---

# 10. リファクタリング方針

命名変更のみを目的とした修正は行わない。

以下のタイミングで実施する。

- Story追加時
- 機能改修時
- Core抽出時

既存動作を維持しながら段階的に整理する。

---

# 11. 対象

Attendance

Payment

Member

Invoice

Evidence

AttendanceSession

View

Runner

---

# 12. 完了条件

- サービス構成が統一されている。
- Core抽出方針が確定している。
- 命名規約が確定している。
- 新規機能は本規約に従う。
- 既存機能は段階的に移行する。

---

# 13. 保留事項

- collect / make / record / post の適用レイヤー整理
- API命名規約
- DTO命名規約
- Batch命名規約
- View命名規約
