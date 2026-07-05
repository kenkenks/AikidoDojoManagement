# PROJECT METADATA

STATUS: 未整備
TYPE: DOCUMENT
TASK: TASK-DEV-011
AREA: STANDARD
PRIORITY: HIGH

TAG: STANDARD
TAG: METADATA
TAG: 未整備

<!--
暫定ルール:
- STATUS は現在の整備状態
- TYPE は文書種別
- TASK は関連タスクID
- AREA は主担当領域
- TAG は検索用キーワード
- RUNNER は対応Runner関数
-->


## 目的

Story、Runner、設計書、タスクで共通して使うメタデータルールを定義する。

## STATUS

- 未整備
- 作成予定
- 作成中
- レビュー中
- 実装中
- Runner対応
- テスト済
- 完了
- 保留
- 廃止

## TYPE

- STORY
- TASK
- DESIGN
- RUNNER
- DOCUMENT
- STANDARD
- VIEW
- MASTER

## AREA

- COMMON
- STORY
- ATTENDANCE
- BILLING
- PAYMENT
- MEMBER
- SIMULATION
- STANDARD

## TAG例

- TAG: STORY
- TAG: ATTENDANCE
- TAG: PAYPAY
- TAG: CASH
- TAG: 未整備

## 検索例

未整備Story:

```text
TYPE: STORY
TAG: 未整備
```

PayPay関連:

```text
TAG: PAYPAY
```

## CATEGORY

- DEV: 業務機能開発
- DOC: ドキュメント整備
- FWK: 開発基盤・自動生成
- IDEA: 将来構想・研究
- SUP: 支援・保守

## SERVICE STANDARD MODEL

Attendanceを当面の標準モデルとする。

```text
Service
├── Member
├── Teacher
├── Core
└── Runner
各責務
Layer	責務
Member	会員操作
Teacher	先生操作
Core	共通処理
Runner	Story実行・検証
VIRTUAL CLASS NAMING

GASではクラスを使わない場合でも、関数名は「仮想クラス + メソッド」として命名する。

例:

AttendanceMemberService.registerBatch()
↓
attendanceMemberRegisterBatch()

AttendanceTeacherService.confirm()
↓
attendanceTeacherConfirm()

AttendanceCore.registerBatch()
↓
attendanceCoreRegisterBatch_()

所属が分からない関数名は避ける。

悪い例:

registerAttendanceBatch()

良い例:

attendanceTeacherRegisterBatch()
attendanceMemberRegisterBatch()
attendanceCoreRegisterBatch_()

あと、既存の `TYPE` と `AREA` も少し更新した方がよいです。

```md
## TYPE

- STORY
- TASK
- ARCHITECTURE
- RUNNER
- DOCUMENT
- STANDARD
- VIEW
- MASTER
- TEMPLATE
- IDEA

## AREA

- COMMON
- STORY
- ATTENDANCE
- BILLING
- PAYMENT
- MEMBER
- SIMULATION
- STANDARD
- ARCHITECTURE
- FRAMEWORK
- IDEA