# QR Generator Functional Prototype - 残り4種類

会員カードのE2E確認完了後、同じ発行フローを4種類へ展開。

## QRターゲットURL
既存スプレッドシート `00_QR閲覧` の運用メモを正としている。

- 会員カード: `/attendance?member_id=...`
- 月謝: `/paypay_code?member_id=...&plan_id=...`
- 都度支払い: `/paypay_code?member_id=...&plan_id=...`
- 道場: `/?location_id=...`
- 先生: `/attendanceCheck?teacher_id=...`

## 変更ファイル
- `web/qr/qr_generator.js`
  - 上記既存ルートに確定
- `web/qr/qr_generator.html`
  - 5種類すべて「プレビューへ」を有効化
- `web/qr/sheets/payment-monthly.html`
- `web/qr/sheets/payment-onetime.html`
- `web/qr/sheets/dojo.html`
- `web/qr/sheets/teacher.html`

## 今回の完了確認
各QRについて:
1. QR生成画面で対象を選択
2. プレビューへ
3. QR画像表示
4. 印刷ボタン動作
5. スマホ実機で読み取り
6. 既存の想定画面へ遷移

## 意図的に未完成
- 帳票デザイン
- 表示項目の最終決定
- ロゴ
- PDF専用出力
- 道場名などの最終表記調整

これらはFunctional Prototype完了後のSheet Design Phaseで扱う。
