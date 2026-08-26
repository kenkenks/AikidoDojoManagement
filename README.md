# QR修正版

## 修正内容

1. 都度払いの金額
   - 誤: `cap_amount` を優先
   - 正: `unit_price` を使用

   月謝:
   - `cap_amount`

   都度払い:
   - `unit_price`

2. 道場表示名
   - `合心館` → `桜風館`

3. URL
   - 変更なし
   - `aishinkankyoto.jp` 等の既存URLはそのまま

## 対象ファイル
- `web/qr/qr_generator.html`
- `web/qr/qr_generator.js`
- `web/qr/sheets/member-card.html`
- `web/qr/sheets/payment-monthly.html`
- `web/qr/sheets/payment-onetime.html`
- `web/qr/sheets/dojo.html`
- `web/qr/sheets/teacher.html`

## 確認ポイント
- 一般/子供/大学生の都度払いが1回単価になること
- 月謝は従来どおり月額になること
- 各帳票の表示上に旧名称「合心館」が残っていないこと
