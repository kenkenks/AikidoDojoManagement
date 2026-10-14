# Step 8H — Firebase出席受付画面の読み取り専用接続

基準: 116 ZIP + Step 8C〜8G適用済みの作業ツリー。

- `attendance.html` の Firebase runtime のみ `attendance_saved_state` を認証済み `/api/webconnect` GET へ振り分ける。GAS runtime は既存JSONPのまま。
- Firebaseでは `attendance_session_info`、`member_attendance_state`、`attendance_rank_options`、`post_receipt` は未接続エラー。GASへのフォールバック禁止。
- Firebaseでは出席登録ボタンを非表示・無効化し、送信関数自体にも拒否ガードを追加。QRの遷移先は変更しない。
- `member_id` は本人認証に使わず、サーバー側のUID紐付けと対象ID一致検査が必須。
- GoogleログインUIは既存Firebase Authを利用。UID対応情報未登録時はサーバーが403を返す。
- 現状は完成した出席受付ではない。出席一括登録、先生権限、稽古枠・級段位取得、実Firestore E2Eは後続ステップ。
- ローカルテスト: `node work/verify-attendance-step8h-browser.cjs`。本番デプロイは行わない。
