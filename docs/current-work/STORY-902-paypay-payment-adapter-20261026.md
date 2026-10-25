# STORY-902 工程① PayPay受付Adapter整備

## 対象イベント

通常のPayPay受付は`902-E150`の1件である。

| Event | 種別 | 日時 | 会員／Plan | 依存候補 | 現在の状態 |
|---|---|---|---|---|---|
| E150 | PAYPAY_PAYMENT／会費受付 | 2027-07-09／時刻未確定 | M001／P002 | E040、E110 | PROVISIONAL／BLOCKED |

`902-E450`（PAYMENT_REPLAY_PAYPAY）と`902-E460`（PAYMENT_DOUBLE_PAYPAY）は通常受付とは異なる検証目的を持つ別イベント種別である。共通PayPay受付Adapterへ暗黙に振り分けず、仕様確定後の専用操作としてBLOCKEDを維持する。

## 既存PayPay契約

既存処理は外部PayPay APIを呼ばず、次の3段階でDEV内の決済証跡を扱う。

1. 会員側開始: `POST paypay_code_start`
   - `request_id`、`member_id`、任意`plan_id`、任意`reception_date`
   - 未収invoiceから`REQUESTED` evidenceを生成または再利用する。
2. 会員側コード登録: `POST paypay_code_record`
   - `request_id`、`member_id`、`evidence_code`、`evidence_items[{evidence_id}]`
   - evidenceを`CONFIRMED`にする。この時点ではpaymentsを生成しない。
3. 先生側入金確定: `POST payment_paypay_post_selected`
   - `request_id`、`location_id`、`billing_block_id`、任意`reception_session_id`、`evidence_items`
   - `CONFIRMED` evidenceを`POSTED`にし、payment生成とinvoice状態更新をtransactionで行う。

開始・コード登録は会員側画面の契約、最終確定は先生側画面の契約である。WebConnect側の既存認証・認可を利用し、Adapterは権限判定を複製しない。金額はinvoiceの未収額からサーバーが決定し、Adapterから送信しない。

冪等性は、開始時の既存active evidence再利用、コード登録時の同一コード再送、最終確定時の`payment_paypay_post_requests/{request_id}`とPOSTED evidenceの検証で担保される。異なるrequest IDでもPOSTED evidenceは再計上できない。

## 共通Adapter

`work/story902-paypay-payment-business-adapter.cjs`を追加した。

- E150をManifestから解決し、B-1検証・B-2継続判定を再利用する。
- executionDateTime、fixture、plan、Expected、依存状態を検証する。
- Mock Transport上でstart→record→postを順次実行し、前段のevidence IDだけを次段へ渡す。
- 各段階の不正応答・通信結果不明で停止し、後段を呼ばない。
- UNKNOWN後の自動再送を禁止する。
- 全経路`businessExecutionAllowed=false`、`evidenceKind=MOCK_ONLY`を維持する。
- 外部PayPay通信、Firebase、Firestore、TimeTripには接続しない。

現在のE150は、実行時刻、fixture（DEV member/location/block/sessionと検証用コード）、Expected（accepted amount/payment count）、E040/E110との確定依存が不足するためBLOCKEDである。イベントレベルの契約確定数は0件。

## Adapter対応状況

| 業務種別 | Manifest件数 | 共通Adapter対象 | 実行契約確定 | 主なBLOCKED |
|---|---:|---:|---:|---|
| 出席登録 | 26 | 26 | 1（E010） | 25件の時刻、fixture、料金別Expected、依存 |
| 現金受付 | 13 | 13 | 0 | 全件の時刻、billing group fixture、未収額Expected、依存 |
| 通常PayPay受付 | 1 | 1 | 0 | E150の時刻、3段階fixture/コード、Expected、依存 |
| 合計 | 40 | 40 | 1 | 未確定値は推測せずBLOCKED |

E450/E460を含む残り7イベントは別業務種別であり、この表の通常Adapter対象には含めない。

## BLOCKED原因と解決方法

| 分類 | 対象 | 解決方法 | 情報源 |
|---|---|---|---|
| Excel定義確認 | 同日イベント時刻、E100/E410/E430/E450/E460等の成功・拒否期待 | 原本の意図を確認し、補完値を確定／暫定としてManifest再生成元へ記録 | Excel「902イベント」、原仕様決定 |
| 既存システムから取得 | plan実値、料金方式、未収額、請求状態 | read-only WebConnectで対象月マスタ・会員請求状態を取得 | `qr_generator_options`、`getMemberInfo`、Payment Reader |
| fixture作成 | 会員、billing group、道場、受付枠、稽古枠、PayPay evidence用条件 | STORY902固定IDのfixture設計をイベント別に拡張し、初期状態を検証 | 既存Schema、fixture manager、専用DEVデータ |
| Expected規則 | 出席の請求生成、現金accepted amount、PayPay payment count | 先行イベント後の業務状態と既存projectorの結果から算出しManifestへ確定値として記録 | attendance/billing projector、既存Commandテスト |
| イベント依存 | 候補止まりの出席→請求→受付、取消・再送・上限連動 | `businessData`と`executionOrder`を分けて原仕様承認し、候補を自動昇格しない | Excel参照欄、月次7段階、業務シナリオ |

## テスト

- PayPay共通Adapter: 10/10 PASS
- 既存PayPay Command: 9/9 PASS
- PayPayコードFirebase UI: 12/12 PASS
- PayPayコードFirestore: 6シナリオ PASS
- PayPay確定Firestore: 10/10 PASS
- PayPay WebConnect: 10/10 PASS
- 出席・現金AdapterおよびB-1〜B-3回帰: 94/94 PASS
- 本工程で再実行した確認: 151/151 PASS
- 実Event、外部PayPay、Firestore、TimeTrip: 未接続

## 次の作業

新しいAdapter追加より先に、40件の共通Adapter対象を実行可能化する「契約補完パス」を小さく確立する。最初はE020を対象に、実行時刻、fixture、P001 Expected、確定依存を原本・read-only契約から確定し、E010以外で初めてREADYになることをMockで確認する。その後、同じ手順を料金プラン単位へ展開する。
