# QR生成入口パッチ

最新版ZIPを基準に、先生側のQR生成導線だけを追加する最小パッチ。

## 変更

- `web/qr/teacher_home.html`
  - 先生メニューに `🔳 QR生成` を追加
  - `qr_generator.html` へ遷移

- `web/qr/qr_generator.html`
  - 新規ページ
  - 先生セッションのみ利用可能
  - 5種類のQR選択ボタンを表示
  - 現段階では対象選択・QR生成・プレビューは未実装

## 重要

- `/attendance` は変更しない
- `member_home.html` は変更しない
- QR生成責務は先生側に限定する

次工程で、QR種類ごとの対象選択UIを実装する。
