# STORY-902 C-1 業務Adapter契約調査

作成日: 2026-10-25
基準: `main` / `5a260a2`
範囲: 調査・設計のみ。API通信、Firebase接続、TimeTrip変更、出席登録、コード変更は未実施。

## 1. 結論

E010は既存の認証付きWebConnect `POST attendance_batch`から、既存`attendance.registerBatch`、Firestore Attendance Core、GAS由来の業務ロジックへ接続できる。新APIやDAO直接呼出しは不要である。

Adapterの責務は、Manifest/fixtureを既存payloadへ変換し、既存応答を正規化し、既存GETによるread-after-write証跡をJudgeへ渡すことに限定する。C-1ではAdapterを実装せず、B-1/B-2/B-3の`businessExecutionAllowed=false`を維持する。

## 2. 調査対象

- `work/story902-event-manifest.json`
- 保留ブランチ `story902-progress-hold-20261025` の `web/qr/story902_e010_common.js`
- 同 `web/qr/story902_e010_browser_transport.js`
- 同 `work/story902-e010-fixture.json`
- `shared/WebConnectCore.js`
- `cloud/api/webConnect.cjs`
- `cloud/api/admin-api.cjs`
- `cloud/api/server.cjs`
- `web/qr/attendance_firebase_read.js`
- `adapters/firestore/DAO_Core.js`
- `cloud/time-travel/target.cjs`
- `gas/04_Attendance.js`
- `gas/04_AttendanceCore.js`
- `gas/03_BillingUsage.js`
- `cloud/attendance/member-state.cjs`
- `cloud/billing/member-info-firestore.cjs`
- `shared/DAO_Definitions.js`
- `work/verify-fw001-registration.cjs`
- `work/verify-fw001-firestore-real.cjs`
- `work/verify-webconnect-http-step7c.cjs`

## 3. E010のManifest定義

47件ManifestのE010は次のとおりである。

| 項目 | 定義 |
|---|---|
| eventId / Excel行 | `902-E010` / 2 |
| eventType | `ATTENDANCE_REGISTER` |
| 操作 | 出席登録 |
| 原本日・時刻区分 | `2027-07-02` / 稽古時 |
| 実行日時 | `2027-07-02T19:30:00+09:00`（確認済み補完） |
| actor | 会員、出席登録画面／登録 |
| Excel会員別名 | `M001` |
| plan | `P002`、都度払い |
| action候補 | `attendance_batch（要確認）` / POST（要確認） |
| 仕様状態 | `EXECUTABLE` |
| 確定依存 | なし |

注意: 47件Manifestの`payload.value`とHTTP期待値は現在も`UNRESOLVED`で、DB期待値は文章のみである。一方、保留ブランチの既存E010共通manifest/Judgeには、`registered_count=1`、`cancelled_count=0`、`charge_count=1`、`planned_amount=1500`が保持されている。数値期待値は既存E010資産に根拠があるが、47件Manifestへまだ構造化統合されていない。この不一致をC-2で解消する必要がある。

## 4. 必須fixtureとTimeTrip

既存E010 fixtureで確定済みの実行用ID・条件は次のとおりである。

- 会員 `STORY902_M001`、billing group `STORY902_G001`
- 先生 `STORY902_T001`
- 道場 `STORY902_L001`
- 課金枠 `STORY902_B001`（1枠=1課金、最大1枠）
- 稽古枠 `STORY902_S001`（19:00–20:00、60分）
- 会員区分 `一般`、現在級 `成人無級`
- plan `P002`（回数料金、単価1,500円、上限7,500円）
- 初期状態: 対象月の出席・月次選択・請求明細が各0件

非請求スキップ経路では、出席日はpayloadの`attendance_date`が使われるが、対象月はTimeTripの`sup_targetMonth(ctx)`、登録日時は`sup_now(ctx)`から取得される。したがってE010はB-3で`2027-07-02 19:30 JST`、対象月`2027-07`を設定・読戻し確認してからでなければ実行できない。業務payloadへテスト日時を注入してこの経路を迂回してはならない。

## 5. 既存WebConnect契約

経路は次のとおり。

```text
POST /api/webconnect
  action=attendance_batch
    -> WebConnectCore: attendance.registerBatch
    -> admin-api: Firebase ID token + server-side principal authorization
    -> attendanceCore.register(input)
    -> Firestore transaction
    -> GAS由来 registerAttendanceBatch / attendanceCore_registerBatch_
```

- HTTPはPOST専用。GETは405。
- 未認証は401。一般会員、先生、adminの範囲はサーバー解決principalで判定される。
- E010は請求を伴う通常登録なので`skip_billing`を指定しない。
- 先生、道場、課金枠、会員、稽古枠、料金、選択ルールは既存マスタで検証される。
- 月次選択未登録の場合、`plan_id=P002`を使って既存ロジックが月次選択・請求明細を生成する。
- Firestore transactionは出席・月次選択・請求・View・級段位更新をまとめ、失敗時に部分結果をcommitしない。

## 6. 入力項目の対応表

外側のHTTP envelopeは`{action:"attendance_batch", input:<下表>}`である。

| Adapter入力 | 既存payload | 根拠・制約 |
|---|---|---|
| Run生成request ID | `request_id` | 既存E010証跡用。ただし現行Attendance Coreはこれを冪等キーに利用していないため、Run Ledgerの再送禁止が必要 |
| Run生成session ID | `attendance_session_id` | 1–128文字のID。未指定時は業務側生成だが、証跡のため明示 |
| E010日付 | `attendance_date=2027-07-02` | 妥当なISO日付 |
| fixture teacher | `teacher_id=STORY902_T001` | 有効先生。権限はクライアント値でなくprincipalで確認 |
| fixture location | `location_id=STORY902_L001` | 有効道場 |
| fixture billing block | `billing_block_id=STORY902_B001` | 道場と整合する有効課金枠 |
| fixture member | `attendance_items[0].member_id=STORY902_M001` | Excel別名`M001`を直接送らない |
| preflight取得級 | `attendance_items[0].current_rank=成人無級` | 既存マスタ読取値と一致させる |
| Manifest plan | `attendance_items[0].plan_id=P002` | 一般会員の選択ルールとP002マスタ整合をpreflight確認 |
| fixture slot | `attendance_items[0].slot_ids=[STORY902_S001]` | E010は1枠だけ |
| 監査用source | `source=story902_e010` | 既存通常登録。紙取込権限フラグは使用しない |

`mode`は旧画面入力に存在するが、WebConnect envelopeのroutingは`action`で行われ、`validateAttendanceInput`の必須値ではない。Adapter契約には不要な二重routing値を持ち込まない方針とする。

## 7. 出力項目の対応表

| E010期待値 | 実レスポンス | 判定 |
|---|---|---|
| 登録成功 | `ok === true`、HTTP 200 | 必須 |
| `registered_count=1` | top-level `registered_count` | 1枠の新規出席行数。直接一致 |
| `cancelled_count=0` | top-level `cancelled_count` | 直接一致 |
| 課金1回 | `usage_billing[0].charge_count` | `slots_per_charge=1`かつ有効枠1件で1。直接一致 |
| 請求予定1,500円 | `usage_billing[0].planned_amount` | P002単価×課金回数、上限適用後。直接一致 |
| 対象会員 | `results[0].member_id` | fixture memberと一致 |
| 登録枠 | `results[0].registered_slot_ids` | `STORY902_S001`を含む |
| 取消枠なし | `results[0].cancelled_slot_ids` | 空配列 |
| 月次選択 | `billing_selections[0]` | member/plan一致、業務生成成功の補助証跡 |

既存レスポンス上、4つの数値期待値はすべて対応可能であり、推測変換は不要。ただし`usage_billing`が配列順だけに依存しないよう、C-2では`member_id`で対象要素を選ぶべきである。

## 8. read-after-write確認

送信応答だけでPASSにせず、同じ認証済みWebConnect境界で次を再読取する。

1. `GET member_attendance_state`へmember/date/location/blockを渡す。
   - `ok=true`
   - `member_id=STORY902_M001`
   - `selected_slot_ids`に`STORY902_S001`
   - `billing_plan_selected=true`、`billing_plan_id=P002`
2. admin主体で既存`GET getMemberInfo`を読む。
   - `targetMonth=2027-07`
   - 対象請求が存在し、集計`billedTotal`が期待状態と整合

`member_attendance_state`は出席枠と選択planを確認できるが、請求明細単体の`planned_amount`を返さない。`getMemberInfo`は集計DTOであり、既存データが厳密に0件の専用fixtureであれば1,500円を照合できる。請求ID・請求単体金額まで必要なら、現行read契約で十分かをC-2で再確認し、不足時に値を捏造しない。

## 9. Adapter責務とインターフェース案

```js
// 設計案。C-1では未実装。
adapter.supports(event) -> boolean
adapter.prepare({ event, fixture, preflightEvidence, run })
  -> { action, method, input, expected }
adapter.execute(command, injectedWebConnectTransport)
  -> { httpStatus, body }
adapter.readAfterWrite(command, injectedReadTransport)
  -> { attendanceState, billingState }
adapter.normalize({ command, response, evidence })
  -> { actual, diagnostics }
```

- `prepare`: eventTypeの振分けと既存payloadへの変換だけを行う。
- `execute`: 注入Transportで既存WebConnectを1回呼ぶ。DAO/Serviceを直接呼ばない。
- `readAfterWrite`: 既存GETのみを使用する。
- `normalize`: 既存フィールドを共通Actualへ写す。業務計算を再実装しない。
- Judge、Run Ledger、TimeTrip、依存継続判定はAdapter外とする。
- B-3の検証済み状態だけでは業務送信を許可しない。後工程の永続Run Ledgerと送信直前ゲートが必要。

## 10. 47イベントへの展開

| eventType | 件数 | 現状の既存契約 | 判定 |
|---|---:|---|---|
| `ATTENDANCE_REGISTER` | 26 | Firebase/GAS `attendance_batch` | 契約確認済み。ただし実行可能はE010のみ。他25件は仕様状態を維持 |
| `CASH_PAYMENT` | 13 | Firebase `payment_cash_accept`、GAS `payment_batch` | 契約差あり。DTO/request_id共通化未確定 |
| `PAYPAY_PAYMENT` | 1 | Firebaseはstart/record/postの複数段階、GAS `payment_batch` | 契約差あり |
| `ATTENDANCE_CANCEL` | 1 | `attendance_batch`の同期解除候補 | 取消scope/payload未確定 |
| `PAYMENT_CANCEL` | 1 | 共通WebConnect未確認 | 契約不足の可能性 |
| `EXAM_FEE` | 1 | 共通WebConnect未確認 | 契約不足の可能性 |
| `PAYMENT_REPLAY_CASH` | 1 | cash受付候補 | request_id冪等契約未確定 |
| `PAYMENT_REPLAY_PAYPAY` | 1 | PayPay post候補 | 同一ID再送契約未確定 |
| `PAYMENT_DOUBLE_PAYPAY` | 1 | PayPay post候補 | 別ID二重支払の期待未確定 |
| `MONTH_END_VERIFY` | 1 | 複合read-only: attendance/payment summary。GASのみteacher statusあり | 単一業務Adapterではなく複合Judge。一部UNSUPPORTED |

Manifest全体は`EXECUTABLE=1`、`PROVISIONAL=30`、`UNRESOLVED=16`。既存契約候補があっても、仕様未確定イベントを昇格させない。Excel行順・`dependencies.candidates`も確定依存として扱わない。

## 11. 未解決事項

1. 47件ManifestへE010の構造化payload/Expectedをどの生成元から反映するか。
2. E010 actorの原本表現「会員」と、認証principalを区別する必要がある。既存認可は本人会員・対応先生・adminをサーバー判定する一方、請求read-after-writeの`getMemberInfo`はadmin限定である。Runnerの認証主体と、業務上のactor/teacherを明記する必要がある。
3. `request_id`はAttendance Coreの永続冪等キーではない。UNKNOWN後の再送禁止を永続Run Ledgerで保証する必要がある。
4. read-after-writeの請求集計が専用fixture以外の同一billing groupデータに影響されないことを実行直前に再確認する。
5. `getMemberInfo`で請求単体1,500円まで十分に照合できるか。集計だけなら送信レスポンスとの二重証拠として扱う。
6. E010以外の日時、payload、期待HTTP/DB状態、fixture、確定依存は工程Aの未確定状態を維持する。

## 12. C-2への引継ぎ

- 最初にE010 Adapterを純粋変換＋注入Transportとしてモック実装する。
- 47件Manifestを直接書き換える前に、工程Aの再生成元とE010既存manifestの一本化方針を決める。
- `usage_billing`はmember IDで選択し、配列先頭固定を避ける。
- POST前にB-1/B-2/B-3、Run provenance、fixture preflight、TimeTrip verifyを再確認する。
- POST後は同一Runを再送せず、HTTP応答と2系統のGET証跡をRun Ledgerへ保存する。
- C-2でも実DEV接続は別承認とし、モック検証までは`businessExecutionAllowed=false`を維持する。
