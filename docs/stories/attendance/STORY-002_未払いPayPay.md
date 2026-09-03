# STORY-002 未払いPayPay

STATUS: 作成中
TYPE: STORY
TASK: TASK-DEV-011-100
AREA: PAYMENT
PRIORITY: HIGH

TAG: STORY
TAG: PAYPAY
TAG: PAYMENT

RUNNER: runner_story_attendance_002

## 概要

料金プランが既に確定し未払い請求を持つ会員が、PayPayで支払い、先生の決済確認・入金反映へつなげるStory。

## 前提

- 月額／都度の正規確定タイミングは出席登録時である。
- 対象月の `04_月次選択` と未払い請求が存在する。
- 会費回収側の月次選択処理が呼ばれる場合も、同一planなら冪等にSKIPしてよい。

## Flow

```text
未払い請求取得
  ↓
会員がPayPay支払いを選択
  ↓
決済エビデンス受付
  ↓
先生が確認
  ↓
入金反映
```

PayPay画面は月額／都度を新規決定する主画面としない。
