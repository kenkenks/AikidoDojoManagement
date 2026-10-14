# Step 8B — Firebase出席受付・認証/認可境界（116 ZIP基準）

## 現在の事実と結論
- `web/qr/attendance.html` の `?member_id=` と `DojoVirtualSession.loginMember()` は画面コンテキストであり、本人認証ではない。これらをCloud Runの権限判断に使わない。
- `web/qr/firebase_auth.js` はGoogleログインとFirebase ID Token取得が可能。ただしFirebase UIDと会員ID・先生IDの**信頼できる対応付け**はこの段階の実装に存在しない。
- `cloud/api/admin-api.cjs` の出席読取2操作は `verifyIdToken(token, true)` と `user.admin === true` を要求。会員・先生を管理者に昇格させて回避してはならない。
- `shared/WebConnectCore.route()` にある出席登録・receipt・級段・会員状態の名前は、`resolve()` とCloud Run実装にはまだ接続されていない。
- Step 8Bで**認可を緩和するランタイム変更はしない**。現行拒否動作を自動テストで固定し、次段階の設計条件を明確化する。

## 次段階で必要な信頼境界
1. Firebase AuthでID Tokenをサーバー検証する。QR内容、URLクエリ、localStorage、仮想セッション、リクエストの `role` / `admin` は権限の根拠にしない。
2. Firestoreの管理対象データ等から `uid → member_id` / `uid → teacher_id` をサーバー側で照合する（登録・失効・複数所属・退会時の挙動も契約化）。**対応表のSchema/運用が未確定のため本パッチでは仮定しない。**
3. 会員: 自分に紐づく出席情報だけを参照可能とする。先生: 指導権限を持つ道場・稽古枠に限定。出席の代理登録主体・権限は運用仕様を確認してから確定。
4. 出席一括登録は `request_id` の冪等性、許可された会員/枠の再検証、重複・部分失敗、受付結果照合をトランザクション境界で検証する。
5. 新しいHTTPエンドポイントを増やさず、既存 `/api/webconnect` にoperation単位の認可を追加する。管理者向け既存read経路は維持する。
6. Firebase Hosting画面は認証・認可・Firestore業務処理のE2E PASS後にだけQRのFirebase URLへ切り替える。GAS画面/経路は維持する。

## テスト
`node --test work/verify-attendance-step8b-authz.cjs`。
非管理者・未認証・偽のクライアントroleでDAOへ到達しないこと、管理者の既存読取が動くこと、未接続操作が拒否されることを確認する。

## 本パッチのスコープ
設計文書＋回帰テストのみ。実行時コード、Firestore、権限、QR URL、Cloud Runトラフィックは変更しない。
