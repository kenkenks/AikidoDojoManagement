# STORY-902 第1段階: Excel 47ケース WebConnect対応調査

調査日: 2026-10-24
範囲: 読み取り・分析のみ。Excel原本、コード、業務データは変更していない。テスト、Git操作、配信は未実施。

## 結論

Excelの47ケースは、出席26、会費受付14、審査費1、出席取消1、支払取消1、重複投入2、二重払い1、月末集計1である。現行契約でGAS/Firebaseの双方から同じaction名で実行できるのは、主として`attendance_batch`である。現金はGASの`payment_batch`とFirebaseの`payment_cash_accept`、PayPayはGASの`payment_batch`とFirebaseの`paypay_code_start`→`paypay_code_record`→`payment_paypay_post_selected`に分かれ、共通ケースDTOから既存actionへ変換する必要がある。

`13_MonthlyIntegrationRunner.js`は月次の順序、Persona、Fixture、最終検証の基準として再利用できるが、Service/DAOを直接呼ぶため新ランナーの実行経路には使わない。`24_WebInterfaceRunner.js`の`doGet/doPost`呼出し、応答解析、assert形式はGAS WebConnect Adapterの基礎として再利用できる。

Excel内に月次請求作成（Billing）のイベントがなく、会費受付は請求作成済みを暗黙の前提にしている。取消、審査費請求作成、月末全体集計にも共通WebConnect契約が不足する。47件をそのまま全件実行可能とは判定できない。

## 凡例

- 月次工程: `Prepare / Billing / Attendance / Cash / PayPay / ExaminationFee / Verify`
- 13対応: `代表`は同種処理を代表シナリオで実行、`部分`は検証観点の一部のみ、`なし`は未実装
- 区分: `W`は書込み、`R`はread-only
- 出席入力A: `teacher_id, location_id, billing_block_id, attendance_date, attendance_session_id, attendance_items[{member_id,slot_ids}], source`。必要に応じ`sync_unselected`
- 現金入力C: GASは`mode=payment_batch, payment_items/payments`、Firebaseは`action=payment_cash_accept, request_id, location_id, billing_block_id, reception_session_id, items[{member_id,billing_group_id}]`
- PayPay入力P: GASは`payment_batch`またはEvidence系契約、Firebaseは開始・確認・選択POSTの3段階と`request_id/evidence_id/受付scope`
- 出席検証V-A: `member_attendance_state`、`teacher_attendance_today`、`attendance_progress_summary`
- 支払検証V-P: `getMemberInfo`、`payment_screen_read`、`payment_reception_summary`

## 47ケース対応表

|ID|ケース名|月次工程|13対応|利用可能なWebConnect action|必要入力|期待結果・検証|GAS/Firebase差分|区分|未対応事項|
|---|---|---|---|---|---|---|---|---|---|
|902-E010|7/2 M001出席登録|Attendance|代表|`attendance_batch`|A/M001/7-02/枠|登録成功、V-Aで選択枠・時間確認|同名。FirebaseはIDトークン・権限必須|W|Excelの枠・期待件数未確定|
|902-E020|7/2 M002出席登録|Attendance|代表|`attendance_batch`|A/M002/7-02/枠|同上|同上|W|同上|
|902-E030|7/2 M005-2出席登録|Attendance|代表|`attendance_batch`|A/M005-2/7-02/枠|同上|同上|W|同上|
|902-E040|7/2 M001現金受付1回目|Cash|代表|GAS:`payment_batch`; FB:`payment_cash_accept`|C/M001/請求group|入金1件、請求状態・受付集計をV-P確認|action/payload/idempotencyが異なる|W|Billingケースがなく請求作成前提|
|902-E050|7/2 M002現金受付|Cash|代表|同上|C/M002|同上|同上|W|同上|
|902-E060|7/2 M005-2現金受付|Cash|代表|同上|C/M005-2|同上|同上|W|同上|
|902-E070|7/4 M006出席登録|Attendance|なし|`attendance_batch`|A/M006/7-04/枠|登録成功、V-A確認|同名、認証差|W|Visitorと請求なし状態のFixture未定|
|902-E080|7/4 M007出席登録|Attendance|なし|`attendance_batch`|A/M007/7-04/枠|登録成功、V-A確認|同上|W|無料会員Fixture未定|
|902-E090|7/4 M006現金受付|Cash|なし|GAS:`payment_batch`; FB:`payment_cash_accept`|C/M006|受付結果または請求なしエラーをV-P確認|契約差あり|W|Visitor受付可否が未確定|
|902-E100|7/4 M007無料対象の支払試行|Cash|なし|同上（候補）|C/M007|無請求/支払不要を明示し書込み0件|GAS/FBのエラーコード未統一|W|業務期待自体が要仕様確認|
|902-E110|7/9 M001出席登録|Attendance|なし|`attendance_batch`|A/M001/7-09/枠|登録成功、累計をV-A確認|同名、認証差|W|日別期待値未確定|
|902-E120|7/9 M002出席登録|Attendance|なし|`attendance_batch`|A/M002/7-09/枠|同上|同上|W|同上|
|902-E130|7/9 M005-1出席登録|Attendance|なし|`attendance_batch`|A/M005-1/7-09/枠|同上|同上|W|家族請求と個人出席のFixture必要|
|902-E140|7/9 M005-3出席登録|Attendance|なし|`attendance_batch`|A/M005-3/7-09/枠|同上|同上|W|同上|
|902-E150|7/9 M001 PayPay受付2回目|PayPay|代表|GAS:`payment_batch`; FB:`paypay_code_start`,`paypay_code_record`,`payment_paypay_post_selected`|P/M001|REQUESTED→CONFIRMED→POSTED、V-Pで1入金|GASは一括、FBは3段階・admin限定|W|共通イベントから複数actionへの展開必要|
|902-E160|7/9 M002現金再支払試行|Cash|なし|GAS:`payment_batch`; FB:`payment_cash_accept`|C/M002/新request_id|二重入金なし、支払済/NOTHING_DUE確認|FBは409契約あり、GAS応答未統一|W|期待エラーの共通化|
|902-E170|7/9 M005-1現金再支払試行|Cash|なし|同上|C/M005-1|同上|同上|W|家族group単位の期待確定|
|902-E180|7/9 M005-3現金再支払試行|Cash|なし|同上|C/M005-3|同上|同上|W|同上|
|902-E190|7/12 M001出席登録|Attendance|なし|`attendance_batch`|A/M001/7-12/枠|登録成功、V-A確認|同名、認証差|W|日別期待値未確定|
|902-E200|7/12 M002出席登録|Attendance|なし|`attendance_batch`|A/M002/7-12/枠|同上|同上|W|同上|
|902-E210|7/12 M005-2出席登録|Attendance|なし|`attendance_batch`|A/M005-2/7-12/枠|同上|同上|W|同上|
|902-E220|7/12 M001現金受付3回目|Cash|なし|GAS:`payment_batch`; FB:`payment_cash_accept`|C/M001|新たな未払請求があれば入金、V-P確認|action/payload差|W|何を3回目として請求するか未確定|
|902-E230|7/16 M001出席登録|Attendance|なし|`attendance_batch`|A/M001/7-16/枠|登録成功、累計確認|同名、認証差|W|期待回数未確定|
|902-E240|7/16 M002出席登録（審査予定）|Attendance|部分|`attendance_batch`|A/M002/7-16/枠|出席成功。審査費は作らない|同名、認証差|W|出席と審査申込の境界確定|
|902-E250|7/16 M005-2出席登録|Attendance|なし|`attendance_batch`|A/M005-2/7-16/枠|登録成功、V-A確認|同上|W|日別期待値未確定|
|902-E260|7/16 M001現金受付4回目|Cash|なし|GAS:`payment_batch`; FB:`payment_cash_accept`|C/M001|入金・受付集計確認|action/payload差|W|請求生成規則未確定|
|902-E270|7/16 M002審査費受付|ExaminationFee|代表|受付は支払action候補。審査費請求作成actionなし|member/extra_code/plan/請求→PまたはC|通常会費と審査費の請求・部分入金・最終入金|13は`billingExtraEnsureInvoice`直呼び。共通WebConnectなし|W|申込・請求作成・入金順序とaction不足|
|902-E280|7/23 M001出席登録|Attendance|なし|`attendance_batch`|A/M001/7-23/枠|登録成功、V-A確認|同名、認証差|W|後続取消と同一session管理|
|902-E290|7/23 M002出席登録|Attendance|なし|`attendance_batch`|A/M002/7-23/枠|同上|同上|W|後続追加枠の基準状態|
|902-E300|7/23 M005-1出席登録|Attendance|なし|`attendance_batch`|A/M005-1/7-23/枠|登録成功、V-A確認|同上|W|家族Fixture|
|902-E310|7/23 M005-3出席登録|Attendance|なし|`attendance_batch`|A/M005-3/7-23/枠|同上|同上|W|同上|
|902-E320|7/23 M001現金受付5回目|Cash|なし|GAS:`payment_batch`; FB:`payment_cash_accept`|C/M001|入金成功、V-P確認|action/payload差|W|E330/E340との関連ID必要|
|902-E330|7/23 M001出席取消|Attendance|なし|`attendance_batch`+`sync_unselected`が候補|A/既存session/残すslot集合|対象のみ取消、有効回数減、他出席不変をV-A確認|両実装の同期取消契約を追加照合要|W|取消ID、履歴、請求再計算仕様未確定|
|902-E340|7/23 M001支払い取消|Cash/Verify|なし|共通actionなし|対象payment/evidence、理由、request_id|対象のみ取消/返金/充当、他取引不変|GAS/FBともWebConnect公開契約なし|W|業務仕様とaction不足|
|902-E350|7/23 M002合計4時間へ追加|Attendance|なし|`attendance_batch`|A/M002/4時間分の異なるslot集合|4時間、有効slot重複なしをV-A確認|同名。利用可能masterは環境依存|W|通常枠で4Hを表すslot確定|
|902-E360|7/23 M002合計6時間へ追加|Attendance|なし|`attendance_batch`|A/M002/6時間分slot|6時間、重複なし|同上|W|6H用master/業務上限|
|902-E370|7/23 M002合計8時間へ追加|Attendance|なし|`attendance_batch`|A/M002/8時間分slot|8時間、容量超過なし|同上|W|8H用master/通常出席への適用可否|
|902-E380|7/26 M001出席登録（有効5回目）|Attendance|なし|`attendance_batch`|A/M001/7-26/枠|取消後の有効5回目をV-A確認|同名、認証差|W|E330成功が依存条件|
|902-E390|7/26 M002出席登録|Attendance|なし|`attendance_batch`|A/M002/7-26/枠|登録成功、V-A確認|同上|W|期待累計未確定|
|902-E400|7/26 M005-2出席登録|Attendance|なし|`attendance_batch`|A/M005-2/7-26/枠|同上|同上|W|同上|
|902-E410|7/26 M001現金受付（取消連動）|Cash|なし|GAS:`payment_batch`; FB:`payment_cash_accept`|C/M001|取消後の請求残額だけ受領、V-P確認|action/payload差|W|出席取消と請求の連動仕様未確定|
|902-E420|7/28 M001出席登録（6回目）|Attendance|なし|`attendance_batch`|A/M001/7-28/枠|有効6回目、V-A確認|同名、認証差|W|回数上限との関係|
|902-E430|7/28 M001現金受付（上限後）|Cash|なし|GAS:`payment_batch`; FB:`payment_cash_accept`|C/M001|追加請求なしなら書込み0件/NOTHING_DUE|FBは409候補、GAS応答未統一|W|上限・過入金の期待仕様未確定|
|902-E440|同一現金入金の再送|Cash/Verify|なし|GAS:`payment_batch`候補; FB:`payment_cash_accept`|E040等と同一`request_id`・同一payload|同一結果を返し入金増加0件|FBはrequest receiptで冪等。GAS同等保証未確認|W|元イベント、GAS idempotency契約|
|902-E450|同一PayPay入金の再送|PayPay/Verify|なし|`payment_paypay_post_selected`等|E150と同一evidence/request/scope|POSTED維持、入金増加0件|GAS/FBの再送応答差を確定要|W|再送対象actionと期待コード|
|902-E460|同じ請求へ別PayPay ID|PayPay/Verify|なし|PayPay 3段階action|新evidence_id、同一invoice|二重払いを拒否し入金増加0件|FBは`PAYPAY_POST_OVERPAYMENT`候補、GAS未確認|W|共通期待コード・生成条件|
|902-E470|7月月末集計|Verify|部分|GAS:`teacher_payment_status`ほか; FB:`payment_reception_summary`,`attendance_progress_summary`等|対象月、日付範囲、scope、対象member群|請求・入金・未払い・出席・取消・審査費を期待値と照合|共通の月次全体actionなし。GAS固有readとFB複合read|R|取消反映、月次請求総額、共通DTO不足|

## 月次7段階との整合性

Excel 47件には`Prepare`と`Billing`の明示イベントがない。全書込みケースを安全に実行するには、Excel外のランナー制御として次を設ける必要がある。

1. Prepare: 対象環境、認証、TimeTrip、専用Fixture、既存状態、Run IDをread-onlyで確認する。
2. Billing: 受付ケースが参照する請求を既存の正規入口で準備する。ただし現在、Firebase WebConnectに月次請求作成actionはない。
3. Attendance: E010-E030、E070-E080、E110-E140、E190-E210、E230-E250、E280-E310、E350-E400、E420。
4. Cash: E040-E100の現金分、E160-E180、E220、E260、E320、E340、E410、E430、E440。
5. PayPay: E150、E450、E460。
6. ExaminationFee: E270（E240を事前出席として参照）。
7. Verify: E470。E330/E340/E440-E460は各工程内の例外検証でもあり、最終Verifyでも再確認する。

## 再利用評価

### 13_MonthlyIntegrationRunner.js

再利用するもの:

- 7段階の順序とTimeTrip時点
- Persona/請求グループ/受付scopeというFixture思想
- 事前確認と対象限定cleanupの思想
- 現金、PayPay、審査費の中間状態
- `steps[]`、expected/actual、最終summary

再利用しないもの:

- `createSheetContext()`、GASシート直接操作
- `billingMonthlyAccept()`、`registerAttendanceBatchLocked_()`、Evidence関数等の直接呼出し
- 行物理削除によるcleanup
- マスタ先頭4会員を自動採用する方式

### 24_WebInterfaceRunner.js

再利用候補:

- `runner_webInterface_get_()`、`runner_webInterface_post_()`
- JSON/JSONP応答解析
- `runner_webInterface_assert_()`と構造化finish
- `attendance_batch`、PayPay、受付集計等の既存入力例

不足:

- Excel Parser、47行の依存順実行、共通Run ID
- GAS外部Web AppとFirebase HTTPのTransport差分
- Fixture準備、snapshot、cleanup
- 月次全体の統括と失敗時skip

## 最初のread-onlyケース推薦

推薦は`902-E470（月末集計）`である。Excel 47件のうち唯一、業務データを書き換えずに成立するケースであり、WebConnect Transport、認証、入力変換、Expected/Actual/Judge、GAS/Firebase比較の枠組みを安全に先行検証できる。

ただし、現時点でE470を完全に満たす単一の共通actionはない。第1回は「E470 read-only composite」として、既存actionだけを順に呼び、結果を統合するのが妥当である。

### GAS前提

- 配信済みWebConnectまたはプロセス内`doGet`を使用
- `teacher_payment_status`、`payment_reception_summary`、`attendance_progress_summary`等の読取り権限
- 対象月、対象期間、location_id、billing_block_id、member_id一覧
- 読取りだけであることをaction allowlistで強制

### Firebase前提

- DEVプロジェクト固定と正規Firebase IDトークン
- adminまたは対象member/active teacherとしての既存認可
- `/api/webconnect`の`payment_reception_summary`、`attendance_progress_summary`等
- `teacher_payment_status`相当は公開されていないため、既存read actionの複合で取得可能な範囲を明示

### 最初の合格条件

- POST actionを一切許可しない
- GAS/Firebase双方でHTTP/業務応答を記録できる
- 同じケースDTOから環境別queryへ変換できる
- `ok`、対象月/scope、出席時間、受付件数・金額について共通化可能な項目を比較する
- 取得不能項目を0扱いせず`UNSUPPORTED`として報告する

## 次段階で先に確定すべき事項

1. E470の共通Expected DTOと、環境別に取得不能な項目
2. Excel外に不足するBilling準備をFixtureとして扱うか、正式ケースとして追加提案するか
3. 現金/PayPayの共通イベントDTOと既存actionへの展開規則
4. E330/E340の取消仕様
5. E440-E460の共通冪等性期待値
6. Excelの2027-07、13番Runnerの2099-07、現行DEV TimeTrip月の扱い
