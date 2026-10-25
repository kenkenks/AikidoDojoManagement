# STORY-902 工程① 現金受付Adapter共通化

## 対象と結論

47イベントManifestには`CASH_PAYMENT`が13件ある。13件すべてで既存WebConnectの`POST payment_cash_accept`を利用できる構造は確認できた。一方、全件で実行時刻、専用fixture、金額を含むExpectedが未確定で、依存関係も候補止まりである。このため、既存Manifestで実行契約が完全確定したイベントは0件であり、全件を理由付きBLOCKEDとした。

## イベント契約一覧

金額はクライアント入力ではなく既存サーバー処理が対象月の未収請求から算出する。表の「未確定」はExcel/Manifestに金額の確定値がないことを示す。

| Event | イベント名 | 日付／時刻 | 会員／Plan | 金額 | 依存候補（未確定） | 状態 |
|---|---|---|---|---|---|---|
| E040 | 会費受付 | 2027-07-02／未確定 | M001／P002 | 未確定 | E010 | PROVISIONAL |
| E050 | 会費受付 | 2027-07-02／未確定 | M002／P001 | 未確定 | E020 | PROVISIONAL |
| E060 | 会費受付 | 2027-07-02／未確定 | M005-2／P011 | 未確定 | E030 | PROVISIONAL |
| E090 | 会費受付 | 2027-07-04／未確定 | M006／P020 | 未確定 | E070 | PROVISIONAL |
| E100 | 会費受付 | 2027-07-04／未確定 | M007／P021 | 未確定 | E080 | UNRESOLVED |
| E160 | 会費受付 | 2027-07-09／未確定 | M002／P001 | 未確定 | E050 | UNRESOLVED |
| E170 | 会費受付 | 2027-07-09／未確定 | M005-1／P011 | 未確定 | E060 | UNRESOLVED |
| E180 | 会費受付 | 2027-07-09／未確定 | M005-3／P011 | 未確定 | E060 | UNRESOLVED |
| E220 | 会費受付 | 2027-07-12／未確定 | M001／P002 | 未確定 | E150、E190 | PROVISIONAL |
| E260 | 会費受付 | 2027-07-16／未確定 | M001／P002 | 未確定 | E220、E230 | PROVISIONAL |
| E320 | 会費受付 | 2027-07-23／未確定 | M001／P002 | 未確定 | E260、E280 | PROVISIONAL |
| E410 | 会費受付 | 2027-07-26／未確定 | M001／P002 | 未確定 | E340、E380 | UNRESOLVED |
| E430 | 会費受付 | 2027-07-28／未確定 | M001／P002 | 未確定 | E410、E420 | UNRESOLVED |

`dependencies.businessData`と`executionOrder`は全件空であり、上表はManifestの`candidates`をそのまま示したものにすぎない。共通Adapterは候補を確定依存へ昇格しない。

## 既存WebConnect・業務契約

- action/method: `POST payment_cash_accept`
- 入力: `request_id`、`location_id`、`billing_block_id`、任意の`reception_session_id`、単一`items[{member_id,billing_group_id}]`
- クライアントから金額、請求ID、plan ID、target monthを送ることは禁止されている。
- サーバーはSystem Contextの`target_month/system_now`、対象billing groupのinvoice/paymentから未収額を算出する。
- 成功応答: `request_id`、`target_month`、`reception_date`、`billing_group_id`、`accepted_amount`、`payments[]`、`idempotent_replay`
- 冪等性: `payment_cash_requests/{request_id}`に入力ハッシュと結果を保存。同一入力は結果を再利用し、同じrequest IDの異なる入力は409 conflict。
- 原子的更新: payments、paymentEvidences、invoices、payment_cash_requestsをFirestore transactionで更新する既存実装を再利用する。
- 認可: 既存WebConnectは検証済みadmin principalを要求する。Adapterは認可ロジックを複製しない。

## 共通Adapter

`work/story902-cash-payment-business-adapter.cjs`を追加した。

- Manifestから任意の`CASH_PAYMENT`を解決する。
- B-1検証とB-2継続判定を再利用する。
- executionDateTime、fixture、plan整合、Expectedを検証し、不足を`blockers[]`で返す。
- fixtureからmember/billing group/location/billing block/reception sessionだけを既存DTOへ変換する。
- 金額計算・invoice配分・冪等処理は持たない。
- 仮想日時は`executionDateTime`として引き渡し、Payment payloadへ注入しない。
- Mock Transportのみ許可し、全経路`businessExecutionAllowed=false`、UNKNOWN自動再送禁止を維持する。

## Expectedとfixture

将来READYにするには、イベントごとに次を確定する必要がある。

- fixture: `source_member_id`、DEV専用`member_id`、`billing_group_id`、`location_id`、`billing_block_id`、任意`reception_session_id`、照合用`plan_id`
- Expected: サーバー算出後の`accepted_amount`と`payment_count`
- TimeTrip: 確定した`executionDateTime`。対象月はTimeTrip/System Contextが決める。

E100（無料対象）、E160/E170/E180（再支払）、E410（取消連動）、E430（上限後）は期待する成功・拒否結果自体が未確定であるため、単なる金額補完ではREADYにしない。

## テスト

- 共通Adapter: 10/10 PASS
- 現金受付既存Command: 6/6 PASS
- 現金受付WebConnect: 6/6 PASS
- 現金受付Firestore: 9/9 PASS
- 現金受付UI: 5/5 PASS
- 現金受付Schema: 6/6 PASS
- B-1〜B-3、E010、出席共通Adapter: 84/84 PASS
- 本工程で再実行したテスト合計: 126/126 PASS
- 実通信、Firestore、TimeTrip変更: なし

## 未確定事項と次の業務種別

優先順位は、(1)現金受付時刻、(2)13件のbilling groupを含むfixture、(3)確定依存、(4)各時点の未収額とpayment count、(5)無料・再支払・取消連動・上限後の期待結果である。次は件数が少なく既存契約が明確なPayPay受付を調査し、現金受付と同じPayment Adapter境界で共通化可能か確認するのが妥当である。
