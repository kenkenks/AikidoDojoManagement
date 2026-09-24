# ARCH-014 Runner契約・入口パターン設計

STATUS: ACTIVE
TYPE: ARCHITECTURE
AREA: RUNNER
PRIORITY: HIGH

## 仕様の基準

デモで確認した業務動作を正とし、Runnerと資料を追従させる。古い資料だけを理由に実装を戻さない。既存Runnerが古い実装名・ソース文字列・不足した擬似環境へ依存する場合は、業務の期待結果を保ちながらテスト環境を改訂する。

## 現金受付

現行paymentEvidence_acceptBatchは、この受付で確認したEvidenceだけを入金へ反映する。旧資料にあった「現金受付直後はCONFIRMEDで止める」「06_入金ログ=0」「postResult=null」は現行の規範ではない。

正常系の期待はREQUESTED → CONFIRMED → 当該受付分のPOSTED/入金反映。別受付や会員PayPayのCONFIRMEDを一括で巻き込まない。先生会費受付画面の入力は現金に限定し、会員PayPay経路は別契約として確認する。

これらは提供ソースとユーザー方針に基づく契約整理であり、本改訂時にGAS実環境で再実行済みという意味ではない。

## Runnerに記載する項目

入口、入力、実行主体、許可される状態遷移、記録対象、禁止する副作用、後続境界、期待DTO、Expected/Actual/Judgeを明記する。部分失敗・再送・重複受付を含める。

業務関数の4工程とRunnerのPrepare/Request/Judge/Verify/Summaryは別の構造。ファイル名や内部関数配置の一致だけで業務契約を検証しない。

## 現存Runner

現金・請求関連は11_MainStoryRunner、03_BillingRunner、実入口と入金反映は24_WebInterfaceRunner、全体は13_MonthlyIntegrationRunnerを参照する。旧資料のrunner_payment_story_p005_cash_entryは提供ZIPに定義がないため、実在する回帰試験として列挙しない。

対象Runner → Main Story → Integration → 必要な実画面確認の順で保証範囲を広げる。ローカル確認の成功だけをGAS実環境のGREENとしない。データを変更するRunnerは専用Fixtureと対象環境を指定して実行する。
