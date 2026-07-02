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
