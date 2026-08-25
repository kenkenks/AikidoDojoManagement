# TASK-QR-002 実装パッチ

## 追加ファイル

- `web/qr/qr_generator.js`
- `tests/qr_generator.runner.js`

## 実装内容

- `buildQrTargetUrl(qrType, params, options)`
  - 既存URLクエリ形式を生成
- `buildQrImageUrl(targetUrl, options)`
  - `api.qrserver.com` のQR画像URLを生成
- `buildQr(...)`
  - HTMLテンプレートから使うまとめ関数

## QR Mapping

- MEMBER_CARD: `member_id`
- PAYMENT_MONTHLY: `member_id + plan_id`
- PAYMENT_ONETIME: `member_id + plan_id`
- DOJO: `location_id`
- TEACHER: `teacher_id`

## URLパスについて

会員カードは現行Google Sheetと公開ページで確認済みの `attendance` を既定値にしています。

支払い・道場・先生については、読み取り側がURLクエリを解釈するため、
ルートを `DEFAULT_ROUTES` または `options.routes` で差し替え可能にしています。
TASK-QR-003/004で実画面導線が固まった時点で既定ルートを確定できます。

## Runner

```bash
node tests/qr_generator.runner.js
```
