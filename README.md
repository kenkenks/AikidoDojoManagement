# QR料金プラン「説明」表示パッチ

## マスター
`03_料金マスタ` に追加された `説明` 列を使用する。

## 共通処理
- GAS: `説明` → `description`
- QR生成画面: 選択されたプランの `description` をプレビューへ渡す
- 月謝/都度プレビュー: `description` が空でなければ「説明」として表示
- 空欄なら何も表示しない

家族専用の if は追加していない。

例:
- P011 表示名: 家族3名
- 説明: 家族3名分
- 金額: 11,000円

表示:
料金プラン  家族3名
金額        11,000円
説明        家族3名分

## 変更ファイル
- gas/21_QrGeneratorOptions.js
- web/qr/qr_generator.html
- web/qr/sheets/payment-monthly.html
- web/qr/sheets/payment-onetime.html

GAS変更後は clasp push / 再デプロイが必要。
