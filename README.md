# QR Generator Step 2 - 対象選択UI

最新版ZIPを正として作成。

## 変更
- `gas/21_QrGeneratorOptions.js`
  - 有効な会員・料金プラン・道場・先生を返す
  - 月謝は `会費タイプ=月会費`
  - 都度支払いは `会費タイプ=回数料金`
- `gas/WebConnect.js`
  - `action=qr_generator_options` を追加
- `web/qr/qr_generator.html`
  - 5種類の選択
  - 会員／プラン／道場／先生の対象選択
  - 選択内容サマリー
  - 先生セッション必須

## この段階の非対象
- QR画像生成
- HTML帳票プレビュー
- 印刷

次工程で「プレビューへ」ボタンにQR生成・帳票表示を接続する。
