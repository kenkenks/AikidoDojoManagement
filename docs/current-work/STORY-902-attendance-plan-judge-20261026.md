# STORY-902 料金プラン別出席Judge

## 既存契約

47イベントの出席登録26件は、P001 9件、P002 7件、P011 8件、P020 1件、P021 1件である。Excel上の表示はP001=月払い、P002=都度払い、P011=家族、P020=ビジター、P021=体験だが、Judgeはplan IDをハードコードしない。DEVマスタで確認した料金方式をManifestの確定Expectedへ`billing_contract`として記録する。

既存出席登録は、未選択時に`billingMonthlyAccept`を通して月次選択と請求を生成する。その後、回数料金だけを出席実績から再同期する。回数料金でない場合の`usage_billing`は`ok:true, skipped:true, plan_id`を返す。これは回数料金同期の対象外という意味であり、月次選択や請求の成功そのものを証明しない。

## Judge契約

### USAGE

E010互換として、`registered_count`、`cancelled_count`、対象会員の`usage_billing.charge_count`、`planned_amount`を照合する。read-after-writeでは`member_attendance_state`のslot・選択planと、`getMemberInfo.billedTotal`を確認する。従来Manifestは数値項目から`USAGE`を推定し、互換性を維持する。

### MONTHLY

Manifestの確定Expectedに次を要求する。

- `billing_contract=MONTHLY`
- `plan_id`
- `registered_count`、`cancelled_count`
- `invoice_count`
- `planned_amount`

POST応答では対象planの`usage_billing`が`ok:true, skipped:true`であることを確認する。さらにread-after-writeで以下をすべて照合する。

- 出席slotが登録済み
- 月次選択済みでplanが一致
- `getMemberInfo.planType`が一致
- invoice件数とinvoice ID件数がExpectedに一致
- `billedTotal`が確定Expectedに一致

金額またはinvoice件数が未確定なら`readExpected()`はnullを返し、Adapterは送信前にBLOCKEDとなる。Judge内で料金計算はしない。

## E020

月額Judgeの構造不足は解消した。ただし、P001のDEV実値、invoice件数・請求額、M002 fixture、実行時刻・slotが未確定なのでE020はBLOCKEDを維持する。`qr_generator_options`のread-only結果でP001の`fee_type`、`unit_price`、`cap_amount`、適用会員区分を確認し、既存請求生成契約に基づくExpectedを確定した後にManifestへ反映する。

## 他プランへの適用

P011/P020/P021も表示名だけで料金方式を決めず、マスタ実値をread-onlyで確認する。回数料金なら`USAGE`、非回数料金で月次選択・invoiceを生成する既存契約なら`MONTHLY`を使用する。無料・請求なし等の契約が既存DTOで別形状になる場合は推測でどちらかへ割り当てず、追加調査までBLOCKEDとする。

## 安全性

全テストはMock/Fakeであり、`businessExecutionAllowed=false`を維持する。DEV接続、実Event送信、Firestore、TimeTrip変更は行っていない。
