# TASK-QR-002 QR生成共通機能

## Scope

1. MEMBER_CARD / DOJO / TEACHER の対象URLを生成する。
2. 対象URLからQR画像URLを生成する。
3. Payload生成と画像生成を分離する。
4. 旧PAYMENT_MONTHLY / PAYMENT_ONETIME生成経路は参照状況を確認後に整理する。

## Acceptance

- member_idから会員カード用URLを生成できる。
- location_idから道場用URLを生成できる。
- teacher_idから先生用URLを生成できる。
- QR生成サービス依存が共通機能に閉じている。
