# 先生向け稽古・審査進捗管理 第2工程

## 結論

Firebase WebConnectにread-only action `teacher_attendance_progress` を追加し、第1工程の一括readerへ接続した。既存Firebase IDトークン、dojo principal、先生マスタの有効判定を再利用する。管理者は既存仕様どおり先生相当として許可し、一般会員と未認証アクセスは拒否する。

## 契約

- HTTP: `GET /api/webconnect?action=teacher_attendance_progress`
- operation: `attendance.teacherProgress`
- 入力: `action` のみ。`teacher_id`、`role`などのクライアント指定は受理しない。
- 出力: 第1工程の `{ok, member_count, progress_items}` を変更せず返す。
- 認可: `user.admin === true`、またはサーバー解決したprincipalの`teacher_id`が有効な先生マスタと一致する場合のみ許可。
- POSTはHTTP dispatcherで405とする。

## 変更ファイル

- `shared/WebConnectCore.js`: actionから既存dispatch operationへの対応を追加
- `cloud/api/admin-api.cjs`: 先生・管理者限定認可とreader呼出しを追加
- `cloud/api/server.cjs`: 一括readerを注入し、GET allowlistへ追加
- `work/verify-teacher-progress-overview-webconnect.cjs`: 認可・偽装・DTO・単体取得回帰
- `work/verify-webconnect-core.cjs`: 共通ルーティング契約
- `work/verify-webconnect-http-step7c.cjs`: 実HTTP callbackのGET/POST境界

## 検証結果

- WebConnect・認可・一括reader・単体reader・HTTP回帰: 36/36 PASS
- 一般会員、無効先生、未連携principal、未認証、不正トークン: reader呼出し前に拒否
- `teacher_id`・`role`偽装: 認可根拠にならず拒否
- `npm run target:build -- dev-firebase`: PASS
- 配信依存関係: 47ファイル PASS
- `git diff --check`: PASS

## 未実施

先生一覧UI、予測表示、実通信、push、deployは未実施。GAS版と既存会員単体actionは変更していない。
