# TASK-QR-003 Step 1 — 会員カード基準テンプレート

まず5種類を一気に作らず、会員カードを基準テンプレートとして実装。

## 実装
- `web/qr/sheets/member-card.html`
- `web/qr/qr_generator.js`（TASK-QR-002から同梱）

## 動作例
`member-card.html?member_id=M001&member_name=山田太郎`

QRの中身は既存仕様:
`https://kenkenks.github.io/AikidoDojoManagement/attendance?member_id=M001`

## 方針
- QRは機械向け情報
- 外側のカードは人向け情報
- 現段階はロゴなし
- ブラウザ印刷対応
- カード寸法は一般的なカード比率の仮値 86mm x 54mm
  - 実運用確認後に調整可能
- まずこの基準を確認後、月謝・都度・道場・先生へ横展開
