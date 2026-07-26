TASK-DEV-019
現金受付・入金反映

STATUS: 実証済・回帰確認待ち
TYPE: TASK
AREA: PAYMENT
PRIORITY: HIGH

TAG: CASH
TAG: PAYMENT
TAG: BILLING
TAG: WEB_CONNECT
TAG: RUNNER
TAG: OPERATION

目的

先生が現金を受領した場合に、
会費の入金として記録し、
請求明細と会費状態Viewへ反映できることを確認する。

確認事項

☑ 未払い請求を準備できる
□ 先生画面で現金受領できる
☑ payment_method = CASH として扱える
☑ 現金は決済コード不要
□ 06_入金ログへ反映される
□ 05_請求明細が支払済になる
□ 20_会費状態Viewが支払済になる
□ 現金合計に反映される

成果物

runner_cash_story_c001()
必要に応じて WebConnect / payment_teacher.html を修正

完了条件

現金受付 → 入金反映 → 支払済確認までPASSすること。

実証結果

runner_payment_story_p005_cash_entry() PASS

受付直後の状態:

- REQUESTED → CONFIRMED
- postResult = null
- 06_入金ログ = 0件
- payment_log_id = 空

残確認:

- 先生画面からPOSTEDへ更新できる
- Main Story Runner PASS
- Integration Runner PASS
- 実画面確認

ARCH昇格

ARCH-014 Runner契約・入口パターン設計へ一般化した。
