# simulation「092ランナー」調査

調査日: 2026-10-24
範囲: 読み取り・分析のみ。コード、Excel、Firestore、GASデータは変更していない。テスト、commit、push、deployは未実施。

## 結論

作業ルート直下に simulation ディレクトリはなく、「092」という名前のRunnerも存在しない。該当案件の実体は docs/Stories/simulation 配下の STORY-902 一か月試験運用である。

現状のSTORY-902資産は、Excel設計台帳、高速インメモリRunner、実シート結合Runner、WebConnect境界Runnerに分かれている。Excelを読み込み、47イベントをWebConnect経由で順次実行するRunnerは未実装である。ただしGASとFirebaseの両方にWebConnect入口があり、業務ロジックやDAOを直接呼ばない構成は実現可能である。

## 関連ファイル

- docs/Stories/simulation/STORY-902_一か月試験運用.md
- docs/Stories/simulation/STORY-902_設計検討記録.md
- docs/Stories/simulation/STORY-902_画面スモーク.md
- docs/Stories/simulation/STORY-902_イベントスケジュール_設計方針反映.xlsx
- gas/12_MonthlyPilotRunner.js
- gas/13_MonthlyIntegrationRunner.js
- gas/24_WebInterfaceRunner.js
- gas/WebConnect.js
- shared/WebConnectCore.js
- cloud/api/webConnect.cjs
- cloud/api/server.cjs
- docs/Architecture/ARCH-003_Runner設計.md
- docs/Architecture/ARCH-014_RUNNER_CONTRACT.md
- docs/Tasks/TASK-DEV-011_運用ストーリーランナー.md

## Excelの構造

ブックは6シートで、数式セルは0件。実行ファイルではなく設計台帳である。

| シート | 内容 |
|---|---|
| 902イベント | 48行×26列。ヘッダー1行とイベント47件 |
| 会員・料金 | 9行×4列。member_id、区分、plan_id、備考 |
| 確認事項 | 13行×3列。未確定仕様 |
| 項目定義・調査手順 | 13行×3列。列定義と確認先 |
| 902設計判断 | 18行×4列。WebConnect、データ隔離等の方針 |
| 実行・消去ルール | 12行×3列。Run ID、実行、照合、消去手順 |

902イベントの主な列は、イベントNo、日時、会員・料金情報、WebConnect action、HTTP method、送信payload、期待応答、期待DB状態、参照イベント、Run ID、生成レコードID、実行結果、消去確認である。

イベント内訳は、出席登録26件、会費受付14件、審査費受付1件、出席取消1件、支払い取消1件、重複投入2件、二重払い1件、月末集計1件。

完成度は次のとおり。

- action: attendance_batch（要確認）26件、payment_batch（要確認）15件、未照合6件
- HTTP: POST（要確認）41件、未照合6件
- 照合状態: 47件すべて「要コード照合」
- Run ID、生成ID、実行結果、消去確認: 全47件が空欄
- payloadは人間向け説明で、実行可能なJSONではない

したがって現在のExcelは、WebConnect契約確定前の設計台帳であり、そのまま実行できるテストケースではない。

## 既存Runnerの状態

### 高速コアRunner

gas/12_MonthlyPilotRunner.js:4 の runner_story_simulation_902 は、2026年7月のハードコードScenarioをメモリ内で実行する。シート書込みと設定書込みは0件だが、Excelを読まずWebConnectも通らない。月次計算の高速回帰用である。

### 総合結合Runner

gas/13_MonthlyIntegrationRunner.js:14 の runner_story_integration_902 は、2099-07の専用データを実GASシートへ作成する。Preflightはread-onlyだが、本体はService/Domain関数を直接呼び、WebConnect経由ではない。

Prepareでは、専用対象について次のシート行を削除・再作成する。

- 04_月次選択
- 05_請求明細
- 06_入金ログ
- 07_出席ログ
- 09_決済エビデンス
- 20_会費状態View

### WebConnect境界Runner

gas/24_WebInterfaceRunner.js:52-66 は、doGet/doPostを呼ぶ共通ヘルパーを持つ。出席、会費、PayPay等の個別Runnerはあるが、Excelの47イベントをSTORY-902として読み込む処理はない。書込みactionを実行すれば実シートを変更する。

## Excel読込み機能

未実装である。該当Excel名、902イベントというシート名、実行結果列を参照するコードは存在しない。Parser、Schema検証、イベント依存順、Expected/Actual判定、結果保存も存在しない。

## WebConnect経路

shared/WebConnectCore.js がactionをoperationへ変換する。attendance_batch、payment_cash_accept、payment_paypay_post_selected、paypay_code_start、paypay_code_record等が定義済みである。

GASは gas/WebConnect.js の doGet/doPost が入口で、24_WebInterfaceRunnerに利用実績がある。現金受付等には payment_batch、payment_evidence_post_selected などのGAS互換契約も残る。

Firebaseは cloud/api/server.cjs:257-283 の GET/POST /api/webconnect が入口で、cloud/api/webConnect.cjs が共通契約から既存handlerへ振り分ける。正規Firebase IDトークンが必要で、認証・先生／管理者権限境界は維持される。

Excelの payment_batch はFirebaseの正式actionではない。Firebaseでは payment_cash_accept や payment_paypay_post_selected を使う。よって共通の業務イベントDTOと、GAS/Firebaseの既存WebConnect payloadへ変換する薄いTransport Adapterが必要である。DAOやServiceを直接呼ぶ必要はない。

## 入力・期待・結果の管理

現状の入力は「member_id=M001; ...」という説明文であり、機械実行可能なJSONではない。期待値も文章で、HTTP status、ok、エラーコード、件数、生成ID等の判定規則は未定義である。

各イベントに最低限、event_id、run_id、backend、method、action、input、expected、depends_on、cleanup_scopeを定義する必要がある。初期段階では元Excelへ結果を書き戻さず、run_id単位のJSONとMarkdownへ分離保存する方が安全である。

## 書込み対象と影響

GAS:

- attendance_batchは07_出席ログ等を変更する
- 現金・PayPayは09_決済エビデンス、06_入金ログ、05_請求明細の支払状態、20_会費状態View等へ影響する
- 月次請求は04_月次選択、05_請求明細等を変更する
- Integration RunnerのPrepareは専用対象行を物理削除する

Firebase DEV:

- attendance_batchはattendancesを変更し、通常スコープでは請求側へも影響し得る
- payment_cash_acceptはpayments、paymentEvidences、invoices、payment_cash_requestsを変更する
- payment_paypay_post_selectedはpayments、paymentEvidences、invoicesを変更する
- paypay_code_start/recordはpaymentEvidences等を変更する

したがってread-only preflightとapplyを分離し、本番拒否、専用Fixture、Run ID、事前事後snapshotを必須にすべきである。

## 未実装部分

1. Excel ParserとSchema検証
2. 47イベントの正式action、method、payload確定
3. 人間向け期待文から機械判定expectedへの変換
4. GAS/Firebase Transport Adapter
5. Firebase認証主体の安全な取得
6. イベント依存関係、失敗時中断・skip
7. read-only snapshotと差分検証
8. 専用Fixture、冪等性、後片付け
9. 月次請求、取消、月末集計のWebConnect経路確定

## 推奨実装計画

### 工程1: Excel契約確定

47イベントを現行画面とWebConnectへ照合し、action、method、input JSON、expected JSONを確定する。「要確認」「未照合」が1件でもあれば実行不可とする。

### 工程2: read-only Parser / Preflight

ローカルNodeツールでExcelを読み、重複ID、必須値、日時、循環依存、未確定action/payloadを検出する。デフォルトはリモート呼出しも行わない。

### 工程3: WebConnect Adapter

- GAS: doGet/doPost契約または配信済みWeb App endpoint
- Firebase DEV: GET/POST /api/webconnectと正規Firebase IDトークン

どちらもDAO、Service、業務ロジックを直接呼ばない。backend、environment、dry-run、apply、run-idを明示し、DEV専用Fixtureかつapply指定時だけ書込みを許可する。

### 工程4: read-onlyケースのパイロット

system_context、出席状態、会費画面読取り、月末集計等から少数実行し、GAS/FirebaseのExpected/Actual/Judge形式を安定させる。

### 工程5: 専用Fixtureで書込みケース

本番拒否、専用会員・請求グループ・対象月・Run IDを強制する。各イベント前後でsnapshotを取得し、WebConnectの読取りactionでVerifyする。重複投入は同じrequest_idで検証する。

### 工程6: 47イベントと後片付け

依存順に実行し、失敗したイベントに依存する後続をskipする。Run ID所有のデータだけを取消・削除し、通常データが不変であることを最終差分で確認する。

## 次工程前の判断事項

1. 案件名を「092」のまま扱うか、実体に合わせSTORY-902と呼ぶか
2. 最初のbackendをGASかFirebase DEVのどちらにするか。推奨はFirebase DEVのread-only action
3. 結果をExcelへ書き戻すか、別JSON/Markdownへ保存するか。推奨は別ファイル
4. 2027-07（Excel）、2026-07（Core）、2099-07（Integration）の基準月をどれに統一するか
5. 専用Fixtureと後片付け権限・方式

## 補足調査: 13_MonthlyIntegrationRunner.jsを基準にした再利用評価

### 月次シナリオと処理順序

`runner_story_integration_902()`は対象月を`2099-07`に固定し、次の7段階を順番に実行する。

1. Prepare: `paymentReception_ensureSchema()`後、対象月・選択された4会員／請求グループに属する04、05、06、07、09、20の行を削除する。
2. Billing: 7月1日として、4会員へ`billingMonthlyAccept()`で月次請求を作成する。
3. Attendance: 7月2日として、UNPAID役を除く3会員を`registerAttendanceBatchLocked_()`で2枠登録する。
4. Cash: 7月9日として、CASH役の未払い請求を`paymentEvidence_request → paymentEvidence_record → paymentEvidence_post`で入金する。
5. PayPay: 7月12日として、PAYPAY役を同じ3段階で入金する。
6. ExaminationFee: 7月16日として、EXAM役へ`billingExtraEnsureInvoice()`で審査費を追加し、月会費入金後も審査費が未払いである中間状態を確認してから全請求を入金する。
7. Verify: 7月31日として、請求5件、入金4件、POSTED証跡4件、出席あり、受付Scope保存、3グループ支払済、1グループ未払い、受付集計、先生集計を確認する。

各段階は`monthlyIntegration902_runStep_()`が時間、PASS/FAIL、結果または例外を`steps[]`へ残し、LoggerへJSONを出力する。最終結果は`total=7`のsummaryである。途中失敗時も原則として後続段階へ進むため、Excelランナーへ再利用する際は依存イベントのskip規則を別途設ける必要がある。

### Excel 47ケースとの対応

13番RunnerはExcelの47行を1対1に実行していない。対応するのは月次業務の代表的な集合だけである。

| Excel分類 | 件数 | 13番Runnerでの対応 |
|---|---:|---|
| 出席登録 | 26 | Attendanceの1回のbatchに集約。日別26イベント、再登録、個別の期待値までは扱わない |
| 会費受付 | 14 | Cash／PayPay／ExaminationFeeの代表4入金に集約 |
| 審査費受付 | 1 | ExaminationFeeで部分入金の中間状態を含めて対応 |
| 出席取消 | 1 | 未実装 |
| 支払い取消 | 1 | 未実装 |
| 会費入金の重複投入 | 2 | 未実装 |
| 会費入金の二重払い | 1 | 未実装 |
| 月末集計 | 1 | Verifyで集計整合を確認。ただしExcelの期待文との行単位照合ではない |

さらにExcelの基準月は2027-07、13番Runnerは2099-07であり、PersonaもExcel／Story記載の固定IDではなく、現在のマスタから異なる請求グループの有効会員4名を先頭順で選ぶ。したがって13番Runnerは47ケースの実装本体ではなく、業務順序、Fixture隔離、事前準備、最終整合性の参照実装として扱うべきである。

### 24_WebInterfaceRunner.jsとの関係と機能差

13番Runnerは月次Scenarioを統括し、TimeTrip、準備、請求、出席、現金、PayPay、審査費、月末検証を一続きにする。一方24番Runnerは`runner_webInterface_get_()`／`runner_webInterface_post_()`から`doGet()`／`doPost()`を呼び、WebConnect入口のDTO・配線・応答を個別に検証する。

24番にはpayment_screen_read、system_context、payment_evidence_post_selected、PayPay E2E、getMemberInfo、member_attendance_state、attendance_batch等の個別Runnerがある。WebConnect再利用の土台としてはこちらが適切だが、Excel読込、月次イベント順序、共通Fixture、依存関係、全体集計、Run ID単位のcleanupはない。

推奨する再利用構造は、13番から「月次の順序・Persona/Scope・Preflight・Verify観点」を抽出し、24番から「WebConnect GET/POST呼出し・応答解析・assert形式」を抽出することである。13番の直接Service呼出しを新Runnerへコピーしない。

### GASの実呼出し経路

- 月次請求: Runner → `billingMonthlyAccept()` → Billingの既存Service/DAO → 04_月次選択、05_請求明細等
- 出席: Runner → `registerAttendanceBatchLocked_()` → Attendanceの既存Service/DAO → 07_出席ログ等
- 審査費: Runner → `billingExtraEnsureInvoice()` → Billing Service/DAO → 05_請求明細等
- 入金: Runner → `paymentEvidence_request()` → `paymentEvidence_record()` → `paymentEvidence_post()` → Evidence/Payment DAO → 09_決済エビデンス、06_入金ログ、05の支払状態、20_View等
- 検証: `getInvoices/getPayments/getPaymentEvidences/getAttendances`および`paymentReception_getScopeSummary()`、`paymentStatusTeacher_get()`

13番Runner自身は`gas/WebConnect.js`を通らない。24番Runnerは`doGet/doPost`を通るためWebConnect経由だが、GASプロセス内の直接呼出しであり、配信Web App・HTTP・外部認証までを試すE2Eではない。

### 入力、期待、検証、ログ

入力は2099-07、マスタから選ぶ先生・道場・課金枠・先頭2稽古枠、異なる請求グループの4会員、月会費・審査費プランである。4会員にはCASH、PAYPAY、UNPAID、EXAMの役割を順番に付ける。固定session ID、source、仮想日時により作成行を識別する。

期待結果はコード内の9系統のcheckと、審査費の部分入金checkで定義される。実行ログは段階ごとのLogger JSONと最終summaryに残るが、ExcelのRun ID／生成レコードID／実行結果列には書き戻さない。永続的な専用実行ログシートも持たず、生成された業務行そのものとApps Script実行ログが証跡になる。

### Firebase DEV移植での再利用可否

再利用可能なのは、7段階の業務順序、Preflight思想、Persona役割、Scope、専用月・source/sessionによる隔離、部分入金の中間検証、最終集計check、構造化step summaryである。

変更が必要なのは次の点である。

- `createSheetContext()`、シート名、行削除、GAS Logger、直接Service/DAO呼出しは再利用しない。
- actionは共有WebConnect契約へ確定する。特にExcelの`payment_batch`をFirebaseへそのまま送らず、`payment_cash_accept`、`paypay_code_start/record`、`payment_paypay_post_selected`等へ業務イベントを分解する。
- 正規Firebase IDトークン、先生／管理者権限、DEVプロジェクト固定、本番拒否を追加する。
- cleanupはGASの物理行削除を移植せず、Run ID所有データだけを既存の取消契約または専用管理手順で処理する。
- Firebaseには月次請求・取消・月末集計のWebConnect公開契約が不足する可能性があり、47行の契約照合で「既存actionで実行」「read-only検証のみ」「現時点では実行不能」を分類する。

新規ランナーの設計前に、まず13番Runnerの各段階をExcelイベントへ対応付け、24番RunnerのWebConnect helperで置換可能な部分を一覧化するのが安全である。最初の実装対象はFirebase DEVのread-onlyイベントとし、書込みイベントは専用Fixture、apply、事前事後snapshot、Run ID所有確認が揃ってから有効化する。
