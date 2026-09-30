# ARCH-003 Runner設計

STATUS: ACTIVE
TYPE: ARCHITECTURE
AREA: RUNNER
PRIORITY: HIGH

TAG: ARCH
TAG: RUNNER
TAG: RDD
TAG: STORY
TAG: REGRESSION

---

# 1. 目的

本ドキュメントでは、Story Runnerおよび各種Regression Runnerの設計方針を定義する。

Runnerは単なるテストコードではない。

StoryやBusiness Processを実行し、

* 受入確認
* 回帰確認
* 境界契約確認
* Integration確認
* 未実装検出
* 実行ログ出力

を行うためのプロジェクト資産とする。

Runnerは実装の進展に合わせて育てる。

```text
実装
↓
実績
↓
ARCHへ反映
```

抽象化を先に固定するのではなく、実際のRunnerで確認された共通構造をArchitectureへ反映する。

---

# 2. 基本思想

基本となるStory Runnerの流れは次のとおりとする。

```text
Story
↓
Runner
↓
Service
↓
Core
↓
Sheet / Repository
```

RunnerはStoryまたはBusiness Processをコード上で再現し、期待する状態へ到達することを確認する。

ただし、現在のRunnerはStoryとの単純な1対1対応だけではない。

同じBusiness Processであっても、

* Core
* Service
* Domain
* Integration
* Web Entry

など、検証する境界が異なれば複数のRunnerを持つことができる。

---

# 3. Runnerの役割

Runnerは必要に応じて以下を担当する。

* Story実行
* Business Process実行
* 自動テスト
* 受入確認
* 回帰確認
* Expected / Actual判定
* Sheet / Repository状態確認
* Service境界確認
* Web Entry境界確認
* Integration確認
* 未実装機能検出
* 実行ログ出力

Runnerは「関数が正常終了した」だけを成功条件としない。

Business Processとして期待した結果になったことを確認する。

---

# 4. Runnerの検証レイヤー

現在の実装実績から、Runnerには複数の検証レイヤーが存在する。

```text
Entry / Web E2E
        ↓
Integration
        ↓
Domain E2E
        ↓
Domain / Story
        ↓
Core / Simulation
```

すべてのRunnerが全レイヤーを通過する必要はない。

Runnerごとに「どの境界を保証するか」を明確にする。

---

## 4.1 Core / Simulation Runner

外部I/Oへの依存を抑え、CoreまたはBusiness Logicを高速に確認する。

主な目的:

* 高速回帰
* Business Logic確認
* 大量Scenario確認
* Sheet書込みを伴わない検証

現行例:

```text
12_MonthlyPilotRunner.js
```

`runner_story_simulation_902()` はIN_MEMORY_COREとして月次Scenarioを高速に検証する。

このRunnerでは実Sheet更新そのものを目的としない。

---

## 4.2 Domain / Story Runner

特定のStoryまたはDomain機能を中心に検証する。

主な目的:

* Story受入確認
* Domain単位の回帰確認
* Business Process確認
* Domain固有のJudge / Verify

現行例:

```text
03_BillingRunner.js
11_MainStoryRunner.js
15_SessionStoryRunner.js
sup_runner_Attendance.js
```

それぞれBilling、Cash、Session、AttendanceなどのDomain / Storyを担当する。

---

## 4.3 Domain E2E Runner

Web Entryを経由せず、Service / Domain APIを直接使用して一連のBusiness Processを検証する。

主な目的:

* Domain内部契約確認
* 状態遷移確認
* Repository / Sheet反映確認
* 上位Entry層から独立した回帰確認

現行例:

```text
23_PaymentReceptionE2ERunner.js
```

PayPay受付について、

```text
REQUESTED
↓
CONFIRMED
↓
POSTED
↓
Payment
↓
Summary
```

までをDomain APIから直接検証する。

受付前と受付後でScope責務が正しく分離されていることも確認する。

---

## 4.4 Integration Runner

複数Domain / Serviceを組み合わせ、実際のRepository / Sheetを使用して業務全体の成立を確認する。

主な目的:

* Domain間連携
* Service間連携
* 実データ構造での回帰
* 月次業務など複合Scenarioの確認

現行例:

```text
13_MonthlyIntegrationRunner.js
```

月次IntegrationではTime Travelを使用し、実ServiceとSheet Contextを通して業務Scenarioを確認する。

高速Core Regressionである `12_MonthlyPilotRunner.js` とは責務が異なるため、両方を保持する。

---

## 4.5 Entry / Web E2E Runner

実際の利用入口に近い境界からBusiness Processを検証する。

主な目的:

* Browser / Web Entry確認
* WebConnect境界確認
* GET / POST契約確認
* EntryからDomainへの接続確認
* 利用者入力パターンの回帰確認

現行例:

```text
24_WebInterfaceRunner.js
```

Web Interface RunnerではPayment、Member、Attendance等について実際のWeb入口に近い形で検証する。

Domain E2E Runnerと同じBusiness Processを扱う場合でも、検証境界が異なる場合は重複とはみなさない。

---

# 5. Runner標準ライフサイクル

Runnerの基本ライフサイクルは次のとおりとする。

```text
Prepare
↓
Execute
↓
Judge
↓
Verify
↓
Summary
```

RunnerによってJudgeとVerifyを一体化してもよいが、概念上の責務は区別する。

---

# 6. Prepare

実行前準備を行う。

例:

* Story対象データ初期化
* 出席ログ初期化
* テストデータ生成
* マスタ読込
* Context生成
* Time Travel設定
* 前提状態確認
* CLEAN状態確認

Prepareでは、Scenario開始時点の前提条件を明確にする。

前提条件を満たさない状態でRunnerを続行し、誤ったPASSを発生させてはならない。

---

# 7. Execute

StoryまたはBusiness Processを実行する。

例:

```text
Step01
↓
Step02
↓
Step03
```

Storyに明確なStep定義が存在する場合、Runnerは原則としてその順序を維持する。

一方、Regression RunnerではBusiness Processの状態遷移をStepとして扱ってよい。

例:

```text
REQUESTED
↓
CONFIRMED
↓
POSTED
```

Runner本体には可能な限りBusiness Processの流れを残し、詳細な判定ロジックはHelperへ分離する。

---

# 8. Judge

Judgeは、Business Processの実行結果がExpectedと一致しているかを判定する。

```text
Expected
↓
Actual
↓
Judge
```

「正常終了したこと」だけをPASS条件としない。

期待結果が失敗であるScenarioでは、期待した失敗になったことがPASSである。

したがって以下はいずれも正常な判定になり得る。

* 成功すべき処理が成功した
* 失敗すべき処理が期待した理由で失敗した
* Skipすべき処理がSkipされた
* 再実行時に既存状態が正しく再利用された

JudgeはBusiness Process単位で行うことができる。

---

# 9. Verify

Verifyは、Judgeで期待どおりと判定された結果が、実際の永続状態・境界状態へ正しく反映されていることを確認する。

例:

* 登録件数
* status
* teacher_id
* location_id
* billing_block_id
* 支払状態
* Evidence状態
* Payment Log
* Summary
* エラー有無

例:

```text
PaymentEvidence Request
↓
09_決済エビデンスにREQUESTEDが存在する

PaymentEvidence Record
↓
EvidenceがCONFIRMEDになる

PaymentEvidence Post
↓
EvidenceがPOSTEDになる
↓
06_入金ログへ反映される
```

VerifyはStoryの受入試験およびRegression Testを兼ねる。

---

# 10. Summary

Runnerは最後に結果をまとめる。

代表的な項目:

```text
ok
total
success
failed
next
elapsed_ms
```

すべてのRunnerで完全に同じ形式を強制するものではない。

ただし、Runnerの成功・失敗を呼出側から機械的に判断できる形式を優先する。

可能な限り、

```javascript
{
  ok: true
}
```

または同等の明確な結果を返す。

---

# 11. NEXT

未実装機能を含むStoryでは、未実装を単純な障害として扱わず、

```text
NEXT
```

として表現できる。

例:

```text
Story Step
↓
NOT_IMPLEMENTED
↓
NEXT
```

これにより、Story全体が未完成でも実装済み範囲までRunnerを実行できる。

ただし、完成済みRegression Runnerでは、実装済みであるべき処理が存在しない場合をNEXTへ逃がしてはならない。

完成済み契約の欠落はFAILとして扱う。

---

# 12. Storyとの対応

RunnerはStoryを実行可能な検証Scenarioへ変換する。

初期設計ではStoryとRunnerの1対1対応を基本としていたが、現在はこれを必須条件とはしない。

```text
Story
↓
Business Process
├─ Core Regression
├─ Domain Regression
├─ Integration Regression
└─ Entry Regression
```

同一StoryまたはBusiness Processに複数Runnerが存在してもよい。

重要なのはRunner数ではなく、それぞれが異なる検証契約を持っていることである。

逆に、別名のRunnerであっても検証契約が完全に包含され、固有の回帰保証を持たない場合は統合・削除対象となる。

---

# 13. Runner Contractと境界

Runnerは「何を実行するか」だけでなく、「どこまでを保証するか」を明確にする。

例:

```text
Domain E2E
Request
↓
Record
↓
Post
↓
Domain State Verify
```

```text
Entry / Web E2E
Browser / Web Entry
↓
WebConnect
↓
Service
↓
Expected Boundary State
```

入口パターンRunnerでは期待状態への到達だけでなく、後続責務へ不正に越境していないこともVerifyする。

同じServiceを呼び出すRunnerが複数存在すること自体は重複ではない。

検証境界とContractが異なる場合、それぞれ独立したRegression資産として保持する。

詳細は以下を参照する。

```text
ARCH-014 Runner契約・入口パターン設計
```

---

# 14. DebugとRunnerの違い

## Debug

Debugは、開発者が個別関数・個別APIの動作を確認するための補助処理である。

Debugは必要に応じて自由に作成してよい。

主な用途:

* 関数単体確認
* API確認
* 一時的な検証
* データ確認
* 開発中の動作確認

Debugは開発者の道具である。

---

## Runner

Runnerは、Story、Business Process、またはArchitecture上のContractが成立していることを確認するための検証資産である。

主な用途:

* Story確認
* 受入確認
* 回帰確認
* Business Process確認
* Contract確認
* Integration確認
* 完了判定

Runnerはプロジェクトの資産である。

---

## 運用ルール

```text
Debug  = 個別確認
Runner = 回帰可能な契約確認
```

* DebugコードをRunnerへ混在させない
* Runnerに一時的な検証コードを残さない
* Runnerは再実行可能性を意識する
* RunnerはExpectedを明確にする
* Runnerは完了判定に使える品質を保つ

---

# 15. ログ設計

Runnerは必要に応じて以下を出力する。

* Step
* Phase
* 経過時間
* Message
* Success
* Failed
* NEXT
* Expected
* Actual
* Verify結果

Runnerログは単なるDebug Logではなく、

```text
運用ログ
受入ログ
回帰ログ
```

として利用できる形を目指す。

---

# 16. Runnerの存廃ルール

Runnerはファイル名や呼び出すServiceが似ているという理由だけで削除してはならない。

次の条件だけでは重複とは判定しない。

* 同じServiceを呼んでいる
* 同じStoryを扱っている
* 同じBusiness Processを扱っている
* より上位のE2E Runnerが存在する

検証境界またはContractが異なる場合は、それぞれ保持する。

---

## 16.1 KEEP判断

次のいずれかを持つRunnerは保持対象とする。

* 固有のStoryを検証する
* 固有のBusiness Processを検証する
* 固有の検証境界を持つ
* Core高速回帰として価値がある
* Domain単位の回帰として価値がある
* Integration Gateとして使用する
* Entry / Web契約を保証する
* ArchitectureまたはStoryから現役資産として参照される

---

## 16.2 DELETE / 統合判断

次の条件を総合して削除または統合を判断する。

* 現行Architectureから役割を説明できない
* 現行Storyから参照されない
* 他Runnerへ検証契約が完全に包含される
* 固有のExpected / Verifyを持たない
* 現行実装と乖離している
* 未完成のまま残り、正常なRegressionとして機能しない
* 呼び出し・文書・運用上の利用実績がなく、代替Runnerが存在する

単に `git grep` で外部参照がないことだけを削除理由とはしない。

GAS RunnerはApps Script Editorから直接実行される場合があるため、実装内容と検証Contractを確認した上で判断する。

---

# 17. 現行Runner構成

Legacy整理後の現行Runnerは以下とする。

| Runner                            | レイヤー / 主責務                      |
| --------------------------------- | ------------------------------- |
| `03_BillingRunner.js`             | Billing Domain / Regression     |
| `11_MainStoryRunner.js`           | Cash受付Story / Domain Regression |
| `12_MonthlyPilotRunner.js`        | Core / In-Memory高速Regression    |
| `13_MonthlyIntegrationRunner.js`  | 月次Integration Regression        |
| `15_SessionStoryRunner.js`        | Session Story Regression        |
| `23_PaymentReceptionE2ERunner.js` | Payment Reception Domain E2E    |
| `24_WebInterfaceRunner.js`        | Web Entry / Interface E2E       |
| `sup_runner_Attendance.js`        | Attendance Story Regression     |

Runnerは番号順ではなく、検証責務によって理解する。

---

# 18. Legacy整理

Runner棚卸しにより、以下は現行Runnerから削除した。

## 09_PaymentEvidenceRunner.js

旧Payment Story Runner群を含んでいたが、現行のRegressionとして独立した役割を持たず、未完成の実行経路も含んでいたため削除した。

Payment Evidence / Payment Receptionの回帰保証は、現行のDomain E2E、Integration、Web Entry Runnerへ整理する。

---

## 22_PayPayMemberRunner.js

`paypayCode_start()` による会員PayPay開始と請求生成確認を行っていた。

この検証契約は `23_PaymentReceptionE2ERunner.js` のPayPay受付E2Eに包含され、固有の回帰保証を持たないため削除した。

`paypayCode_start()` 自体はBilling Runner、Payment Reception E2E、WebConnect経路等でも使用されている。

---

# 19. RunnerCoreについて

Runner共通処理の抽象化は、実装実績を確認してから行う。

RunnerCoreを先に設計し、すべてのRunnerを強制的に同じ形へ合わせることはしない。

現在のRunnerには、

* Core Simulation
* Domain Story
* Domain E2E
* Integration
* Web Entry E2E

という異なる責務が存在する。

したがって、共通化する場合も「すべてを同じRunnerへする」のではなく、実際に複数Runnerで安定して重複しているInfrastructureのみを抽出する。

方針は従来どおり、

```text
実装
↓
実績
↓
共通構造の発見
↓
抽象化
↓
ARCHへ反映
```

とする。

---

# 20. 今後の展開

新しいStoryまたはBusiness Processを追加した場合、既存Runnerで十分に回帰保証できるかを最初に確認する。

必ず新規Runnerを作るわけではない。

新規Runnerを追加する場合は、

```text
何を検証するか
どの境界を検証するか
Expectedは何か
どこまでVerifyするか
既存Runnerと何が異なるか
```

を明確にする。

Runner数を増やすことではなく、必要なRegression Contractを過不足なく保持することを目的とする。

---

# 21. 関連文書

* ARCH-001 サービス構成
* ARCH-002 命名規約
* ARCH-004 Payment / Attendance対応表
* ARCH-014 Runner契約・入口パターン設計
* ARCH-VIRTUAL-LOGIN-001
* TASK-DEV-011 運用ストーリーランナー
* STORY-001 通常出席
* STORY-902 一か月試験運用
