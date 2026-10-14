# Step 8A — Firebase 出席受付・通信境界調査（116 ZIP基準）

## 目的
Firebase Hosting `/qr/` 内でカメラ・QR読取から出席登録まで完結させる。GitHub Pages/GASへの迂回をFirebase経路に持ち込まない。GAS版は維持し、既存WebConnect Dispatcherを利用する。認証・認可を省略しない。

## 確認した事実
- `web/qr/attendance.html`: `html5-qrcode` で読取。`attendance_rank_options`、`attendance_session_info`、`member_attendance_state`、`attendance_saved_state`、`post_receipt` を `jsonp(GAS_URL, ...)` で取得。`attendance_batch` は隠しiframeへのフォームPOST。
- `shared/WebConnectCore.js`: `route()` は上記の各操作を業務名へ分類するが、`resolve()` は `attendance_session_info` と `attendance_saved_state` のみ解決する。
- `cloud/api/webConnect.cjs`: `resolve()` で解決できない操作は `UNKNOWN_ACTION` (404)。`route()` の定義だけではCloud Runへ接続できない。
- `cloud/api/admin-api.cjs`: 接続済み出席読取2種はFirebase ID Tokenと `admin === true` を要求する。会員・先生用の権限契約ではない。
- `cloud/api/server.cjs`: `/api/webconnect` は単一入口。GETのreadActionsは既存2種を含む。新規のURLを増やす必要はない。
- `web/qr/attendance.html`: 登録payloadに `request_id`, `attendance_session_id`, `attendance_items` があり、結果を `post_receipt` と再読込で照合する。`source: github_pages_qr` が残存。
- `web/qr/dojo_api_client.js`: Firebase ID Token付きfetchを提供するが、現行attendance.htmlには未接続。

## 依存関係と移行順序
1. 会員・先生のFirebase認証/認可と操作主体（誰が誰の出席を登録できるか）を定義する。`member_id` / QR内容だけを認証にしない。既存admin権限を会員へ付与しない。
2. `attendance.sessionInfo`、`attendance.savedState` の会員向け許可範囲を明示し、既存管理者APIと混同しない。
3. `attendance.rankOptions`、`attendance.memberState` を既存業務契約に沿って実装・接続する。DAOの必要なデータを確認する。
4. `attendance.registerBatch` をFirestoreで実装する。冪等性 `request_id`、部分失敗、取消・上書き、権限、重複送信のテストを先行する。
5. `attendance.postReceipt` と保存結果の再読込を接続し、既存画面の完了判定を維持する。
6. Firebaseターゲットに限って通信アダプタを切替。GASターゲットを変更しない。
7. QR URLをFirebase Hosting `/qr/` 配下の**実在するルート**へ切替。会員・先生・決済の各経路は個別にE2E確認する。

## 安全境界
- 8Aでは実行時コード・認証・Cloud Runトラフィック・QR URLを変更しない。
- `WebConnectCore.route()` の操作名をそのままCloud Run実装済みと判定しない。
- admin専用read APIを会員画面から無条件に呼び出さない。
- Firebase版の出席登録を、GASへ暗黙にフォールバックさせない。
