# STORY-902 E020 契約確定・READY判定

## 判定

`902-E020`は**BLOCKEDを維持**する。既存資料とコードから、2027-07-02、M002、P001（月払い）、`POST attendance_batch`、確定依存なし、までは確定できた。一方、実行時刻、M002専用fixture、P001のDEV実値、月額ExpectedとJudge契約が未確定であり、READY条件を満たさない。

READY化のための仮値は置かず、`work/story902-event-manifest.json`も本工程では変更していない。確定済み事項と不足事項は`work/story902-e020-contract-readiness.json`へ分離して記録した。

## 原本との照合

Excel「902イベント」3行目の記載は次のとおりである。

| 項目 | 原本 |
|---|---|
| Event | 902-E020 |
| 日付／時刻区分 | 2027/07/02／稽古時 |
| 操作 | 会員、出席登録画面／登録 |
| 会員／料金 | M002／月払い／P001 |
| 入力 | `member_id=M002; 出席日=2027/07/02; 稽古枠・時間=要確認` |
| action／method | `attendance_batch（要確認）`／`POST（要確認）` |
| payload／応答 | 未照合／未確定 |
| 期待状態 | 指定会員・日時・枠の出席記録が正しく登録される |
| 参照イベント | 空欄 |

「会員・料金」シートもM002／月払い／P001を定義する。原本は、送信payloadを画面コードとWebConnectで照合し、未確定ルールを推測で確定しない方針を明記している。

## 確定した既存契約

- WebConnectは`POST attendance_batch`を`attendance.registerBatch`へ解決する。
- 入力は`request_id`、`attendance_session_id`、`attendance_date`、`teacher_id`、`location_id`、`billing_block_id`、`attendance_items[]`である。
- itemは`member_id`、`current_rank`、`plan_id`、`slot_ids[]`を持つ。
- 月次選択がない状態で有効なslotを登録すると、既存`registerAttendanceBatchLocked_`が`billingMonthlyAccept`を呼び、月次選択と請求を業務ロジック側で生成する。
- P001のような月額プランは回数料金同期の対象外であり、`usage_billing`は`skipped:true`を返す。E010/P002の`charge_count`・`planned_amount`形式を無条件に流用できない。
- TimeTrip日時は業務payloadへ注入せず、共通TimeTrip controllerが事前設定・検証する。

## 情報源別の確定状況

| 項目 | 状態 | 情報源／解決方法 |
|---|---|---|
| 日付、会員、plan、種別 | 確定 | Excel原本、47件Manifest |
| action、method、基本payload項目 | 確定 | `shared/WebConnectCore.js`、既存出席画面、共通Adapter |
| 月次選択の自動生成 | 確定 | 既存出席登録実装 |
| E010への業務依存 | なし | Excel参照イベント空欄。行順候補は依存へ昇格しない |
| 実行時刻／slot | 未確定 | 原本は「稽古時」「要確認」。ユーザーによるslot・時刻承認が必要 |
| M002 fixture | 未確定 | STORY902専用member、teacher、dojo、billing block、slot、rankの作成設計が必要 |
| P001実値・適用条件 | 未確認 | DEV認証済み`qr_generator_options`のread-only GETで確認する。接続は本工程では未実施 |
| Expected HTTP | 未確定 | 既存成功応答を基礎に、月額Expected確定後にManifestへ記録 |
| 月額請求額 | 未確定 | P001マスタ実値と請求生成結果を使用。Adapterで料金計算しない |
| read-after-write Judge | 対応済み・Expected待ち | 月額は`skipped:true`だけでなく、月次選択、plan、invoice件数、`getMemberInfo.billedTotal`を照合する |

## fixture・Expected

fixtureはM002専用でなければならない。E010の`STORY902_M001`等を流用せず、`source_member_id=M002`に対応する固定ID群、P001を選択可能な会員区分、実在する級段位、承認済みteacher、dojo、billing block、2027-07-02のslotを用意する。初期状態は出席0、月次選択0、請求0をread-only preflightで再確認する。

Expectedとして、クリーンな専用fixtureと1枠が確定した場合の`registered_count=1`、`cancelled_count=0`、P001では回数料金同期がskipされることまでは条件付きで定義できる。P001の請求予定額はマスタ実値未確認のためnullのままとし、Manifestの`businessValues`には昇格していない。

## READY化手順（他の出席25件にも展開）

1. Excel原本で日付、会員、plan、参照イベントを固定する。
2. 既存WebConnectと業務コードでaction、method、payload、料金方式別レスポンスを確認する。
3. read-only actionで対象planのDEV実値と選択ルールを取得する。
4. source memberごとの専用fixture mappingと初期0件preflightを定義する。
5. 原本にない時刻・slotだけを明示承認された補完値として記録する。
6. 料金方式別Expectedとread-after-write Judgeを既存業務結果から定義する。
7. Excel参照欄と業務データ要件から確定依存だけをManifestへ反映する。
8. 静的検証、共通Adapter、E010回帰がPASSした場合のみ`EXECUTABLE`へ昇格する。

## 次の確認

実環境へのread-only接続前に、(1) E020の稽古枠・実行時刻、(2) DEVで`qr_generator_options`を使うこと、を確認する。その後P001実値を取得し、M002 fixtureと月額Expectedを整備する。月額Judge自体は料金プラン別Judge工程で対応済みである。Firestore書込み、TimeTrip変更、実Event送信は本工程では行っていない。
