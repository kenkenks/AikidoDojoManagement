# TASK-QR-002 QR生成共通機能

## Origin

- ITER-003 道場システム リリース準備
- STORY-QR-001 QR発行
- TASK-QR-001 QR種別・データ仕様定義
- 現行Google SheetのQR生成式

現行Google Sheetでは `api.qrserver.com` を利用してQR画像を生成している。

## Scope

1. QR種別とID群から既存形式の対象URLを生成する。
2. 対象URLをURLエンコードする。
3. `api.qrserver.com` を利用したQR画像URLを生成する。
4. HTMLテンプレートから再利用できる共通機能にする。
5. QR Payload生成とQR画像URL生成の責務を分離する。

## Flow

対象情報
↓
既存URL生成
↓
URL Encode
↓
QR画像URL生成
↓
HTMLテンプレート

## Design

概念上、以下を分離する。

```javascript
buildQrTargetUrl(qrType, params)
buildQrImageUrl(targetUrl)
```

`buildQrTargetUrl` は業務上のQRパラメータを扱う。

`buildQrImageUrl` はQR生成サービスへの依存を閉じ込める。

## Acceptance

- member_idから会員カード用URLを生成できる。
- member_id + plan_idから支払い用URLを生成できる。
- location_idから道場用URLを生成できる。
- teacher_idから先生用URLを生成できる。
- 生成した対象URLからQR画像URLを生成できる。
- QR生成サービス依存が共通機能に閉じている。
- 既存QR読取側の変更を原則必要としない。

## Out of scope

- QR中央ロゴ
- QR生成サービスの最終選定
- QR画像のサーバー保存
- HTMLレイアウト
- PDF生成
