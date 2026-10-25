# 紙出席簿共通化 第5段階：先生承認処理

## 実装範囲

- 先生ホームに「確認待ちの紙出席」一覧と個別承認を追加。
- 既存 WebConnect 境界に `attendance_pending_list` (GET) と `attendance_pending_confirm` (POST) を配線。別URLのAPIは追加していない。
- Firebase では既存 `attendances` ドキュメントを transaction 内で再取得し、状態・識別子を再検証して `確認待ち` から `確認済` へ更新。新規出席は作成しない。
- 承認者 `teacher_id` はクライアント値ではなく、検証済み Firebase UID と `dojo_auth_accounts` からサーバーが解決する。有効な先生だけが一覧・承認可能。
- 再送時に既に `確認済` であれば書き込まず `already_confirmed=true` を返す。取消・通常の有効レコードは承認対象にしない。

## 状態と集計

| 状態 | 保存状態の重複防止 | 出席時間・審査進捗 | 請求 |
|---|---:|---:|---:|
| 確認待ち | 対象 | 対象外 | 対象外 |
| 確認済 | 対象 | 対象 | 紙専用枠の既存ルール（`billing_allowed=false` / `skip_billing=true`）に従い追加請求なし |

`progress-summary` と GAS の出席進捗投影は `確認済` を確定出席に含める。`saved-state` は承認前後の両方を選択済み枠に含めるため、承認待ちの再送も承認後の再登録も防止する。紙専用枠は元々課金対象外であり、承認操作は請求・月次選択・入金ドキュメントを書き込まない。

## 検証

- 新規承認テスト：10/10 PASS（一覧、同一ドキュメント更新、二重承認、状態競合、会員/未認証拒否、先生IDのサーバー解決、進捗集計、重複防止、WebConnect method、UI契約）。
- 出席登録回帰：15/15 PASS。先生直接登録、会員確認待ち、請求・並行登録を含む。
- WebConnect HTTP：14/14 PASS、WebConnect Core：4/4 PASS。
- 紙出席画面：36/36 PASS、出席進捗：8/8 PASS。
- `dev-firebase` ビルド：PASS（47 reachable files）。
- 古い Step 8B 検証は既存 `attendance_batch` 接続後も「未接続で404」を期待するため2件FAIL。今回差分による回帰ではない。

## 未完成部分

- 実Firebaseでの一覧・承認は未実施。デプロイなし。
- 第6段階の総合実機回帰と運用UI調整は未着手。
- GAS Web 公開入口への新action公開は、GAS側の認証境界が同等でないため行っていない。Firebase DEVの既存認証・WebConnectのみが対象。
