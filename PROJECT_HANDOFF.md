# 道場システム 引継ぎメモ

最終更新: 2026-06-24

## 正式な継続先

- 現在のチャット名: `道場システム｜出席登録・会費集金`
- 正本プロジェクト: `C:\Users\pxk07\Documents\道場サポ\workspace\clasp_道場サポ`
- 旧Codex作業フォルダ: `C:\Users\pxk07\Documents\Codex\2026-06-23\new-chat`（移行確認後まで削除せず保管）
- アーカイブから復元した元チャットの内容を、このプロジェクトへ正式に引き継いだ。
- 以前作成した引継ぎ用スレッドは本体記録が欠けて追記不能だったため、再アーカイブ済み。
- コード変更やデプロイは、白井さんの確認なしに勝手に実施しない。

## 現在地

### 出席登録

- `TASK-ATT-002-01`～`03`: 完了。
- `TASK-ATT-003-01`: 完了。
- `TASK-ATT-003-02`～`05`: ローカル実装・自動検証完了、実環境結合確認待ち。
- `TASK-QR-004`: 時間枠別QR方式から、道場・曜日・現在時刻による課金枠自動判定へ変更済み。
- 課金枠が一意に決まらない場合だけ、画面で候補から手動選択する。
- 再登録は追加方式ではなく画面同期方式。選択解除は物理削除せず取消履歴を残す。
- 送信後は登録状態を再取得し、画面選択と保存結果の一致を確認する。

主な変更ファイル:

- `gas/Code.js`
- `gas/02_SheetAccess.js`
- `gas/03_Billing.js`
- `gas/04_Attendance.js`
- `gas/07_WebEntry.js`
- `gas/sheetContext.js`
- `gas/paymentStatusService.js`
- `web/qr/index.html`

### 会費回収

- `web/qr/payment.html`は操作体験段階。
- 対象月、会費タイプ、請求グループ、未払い額をGASから取得する。
- 家族会員は請求グループ単位で二重受付を防止する。
- `06_入金ログ`への正式な`payment_batch`保存、PayPay紐付け、訂正・締め処理は未確定・未実装。

### Git・改行コード

- `web/qr/index.html`と`payment.html`は変更済み。
- 旧QRリポジトリの履歴を保持してGASリポジトリへ統合済み。
- 両HTMLともCRLFが0件であることを確認済み。
- `AikidoDojoManagement`はpublicの正本モノレポ。GASは`gas/`、QR画面は`web/qr/`。
- GitHub Pages公開先は `https://kenkenks.github.io/AikidoDojoManagement/`。
- 出席画面と会費画面はいずれもHTTP 200、正しいGASデプロイID参照を確認済み。
- 旧`QR_MultReadTRNS`リポジトリは履歴保全のため削除せずアーカイブ済み。
- モノレポ統合コミットはGitHubの `main` へpush済み。
- GAS側ソースはローカルと一致し、`clasp push` は差分なしでスキップされた。
- 既存Webアプリは最新バージョン16「feat: 出席同期と会費受付画面を改善」へデプロイ済み。
- QR画面の`GAS_URL`と既存WebアプリのデプロイIDは一致し、公開URLはHTTP 200で応答確認済み。

## 検証済み

```powershell
node work\verify-attendance.mjs
node work\verify-payment.mjs
```

- QR/GASスクリプト構文
- 2枠=1課金、3枠=2課金
- 不正日付拒否
- S1からS2への同期（S1取消・S2追加）
- 全枠未選択時の全取消
- 時刻からの課金枠推定
- 送信後の画面・保存状態比較
- 会費情報マッピング

すべてローカル成功。

## 次に行うこと

1. スマートフォンで、道場QR→課金枠判定→先生QR→会員QR→登録済み枠復元→枠変更→送信→保存結果再確認を行う。
2. スプレッドシートの有効行・取消行・課金回数を確認する。
3. 通過後、`TASK-ATT-003-02`～`05`と`TASK-QR-004`を完了へ変更する。

## 注意

- 実機テストは、追加・取消してよいサンプル会員で行う。
- `web/qr/index.html`の`GAS_URL`と実際のデプロイ先が一致していることを確認する。
- タスクの正本はGoogleスプレッドシート。ローカルExcelは古い可能性があるため、推測で上書きしない。
- チャット整理時も、このファイルと`WORKLOG.md`、Gitコミットを残す。
