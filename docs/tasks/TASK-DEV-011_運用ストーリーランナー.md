# TASK-DEV-011 運用ストーリーランナー

STATUS: 作成中
TYPE: TASK
TASK: TASK-DEV-011
AREA: RUNNER
PRIORITY: HIGH

TAG: TASK
TAG: DEV
TAG: RUNNER
TAG: STORY
TAG: RDD
TAG: SIMULATION

---

# 1. 背景

道場システムでは、単体機能だけでなく、実際の道場運用に沿って品質を確認する必要がある。

これまでの開発では、関数単位・画面単位で動作確認を行ってきたが、今後は以下のような運用単位で確認する。

- 通常稽古日の出席登録
- 未払い会員の支払い
- 先生による確認
- 月初請求
- 月次運用
- 年次運用

そのため、Storyを中心にRunnerを作成し、実際の運用を再現できる開発基盤を整備する。

---

# 2. 目的

本タスクの目的は、StoryをもとにRunnerを作成し、Runnerを以下の用途で利用できるようにすることである。

- 開発確認
- 受入試験
- 運用シミュレーション
- 未実装機能の洗い出し
- 回帰確認

Runnerは単なるデバッグコードではなく、Storyを実行可能にするための開発基盤として扱う。

---

# STORY-902 月次高速Runner

`STORY-902 一か月試験運用`に対して、次を実装する。

- `runner_story_simulation_902()`
- 月初、第1週、第2週、月中、第4週、月末、翌月初日のPhase実行
- `ctx.settings`だけを利用した仮想日時切替
- 出席、請求、現金、PayPay、未払い、審査費、家族会員のScenario
- 期待値と実値を比較するSummary
- Scenario専用IDによる再実行可能なPrepare/Cleanup
- Phaseごとのシステム日時・対象月ログ

画面上のタイムトリップ設定とシステム時刻表示は、本Runner通過後の画面スモーク開始前に実装する。

## 先行修正

会費受付が課金枠必須になったため、既存Runnerの`paymentEvidence_acceptBatch()`呼出しへ次を追加する。

- `billing_block_id`
- `reception_session_id`

実在データを広い月単位で削除する既存Prepareは、STORY-902から再利用しない。

## STORY-902 総合結合Runner

- `runner_story_integration_902_preflight()`はマスタと依存シートを読取り専用で確認する。
- `runner_story_integration_902()`は`2099-07`のトランザクションを本番サービス経由で作成する。
- マスタは変更しない。
- 再実行時は、選択した会員・請求グループの`2099-07`だけを初期化する。
- 出席、月次請求、審査費、現金、PayPay、決済エビデンス、入金ログ、View、課金枠集計を検証する。
- 複数請求への一部入金では、`invoice_id`単位の支払状態が維持されることを検証する。

---

# 3. 開発方針

本タスクでは、Runner Driven Development（RDD）を採用する。

RDDでは、以下の順番で開発を進める。

```text
Storyを書く
↓
Runnerを書く
↓
存在しない処理も呼ぶ
↓
NEXTログを出す
↓
実装する
↓
Runnerを再実行する
↓
Story完了
