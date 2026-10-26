# STORY-902 第3段階：E470 WebConnect実通信前確認

作成日: 2026-10-24
作業区分: コード読取・接続前監査のみ

## 結論

- E470で使用する3 action は、確認した実装上はいずれも読取専用である。
- Firebase DEV は Firebase ID token を付けた `GET /api/webconnect` を用いる。E470全体を実行する認証主体は、`payment_reception_summary` が管理者限定のため DEV管理者アカウントが必要である。
- GAS は既存Webアプリ `doGet` が入口だが、デプロイ設定が `executeAs: USER_DEPLOYING` / `access: MYSELF` である。したがって、デプロイ所有者の正規Google認証セッションでアクセス可能かを実通信前に確認する必要がある。既存の `24_WebInterfaceRunner.js` はGAS内から `doGet` を直接呼ぶため、外部HTTP認証の確認にはならない。
- TimeTripを変更せず再現性を持たせるため、E470入力では `target_month`、`date_from`、`date_to`、各 `reception_date` を必ず明示する。
- 現在のAdapterは認証ヘッダーを結果JSONへ保存しない。ただし、実通信Transportにもヘッダー・トークンをログ出力しない実装を用いる必要がある。

## 1. GAS接続条件

### 接続先・入口

- target: `dev-gas`
- 設定元: `targets/dev-gas.json`
- deployment ID: `AKfycbz_Movz5VBZkf8qHdMkR7kkQRkLkYJAbahN5OPStFT8YXnhCuIGJBCdqjy2PwgWaorUfA`
- WebConnect URL: `https://script.google.com/macros/s/AKfycbz_Movz5VBZkf8qHdMkR7kkQRkLkYJAbahN5OPStFT8YXnhCuIGJBCdqjy2PwgWaorUfA/exec`
- 実行入口: `gas/WebConnect.js` の `doGet(e)`
- 応答: JSON、または `callback` 指定時のみJSONP

### 認証

- `gas/appsscript.json` は `executeAs: USER_DEPLOYING`、`access: MYSELF`。
- `targets/dev-gas.json` の Execution API access も `MYSELF`。
- WebConnect本体にはaction単位のユーザー認証・権限判定はない。境界はGASデプロイのアクセス設定である。
- 外部Node実行では、単純な無認証GETが利用できるとは扱わない。デプロイ所有者の正規Google認証でアクセスし、ログインHTMLやリダイレクトではなくJSONが返ることを最初に確認する。
- 新しい認証方式は追加しない。認証回避、URLへのトークン埋込み、Cookie/トークンのログ保存は禁止する。

## 2. Firebase DEV接続条件

### 接続先・入口

- project: `dojo-management-dev`
- 通常WebConnect base URL: `https://dojo-time-travel-admin-374758850136.asia-northeast1.run.app`
- HTTP入口: `GET {baseUrl}/api/webconnect?action=...`
- 設定元: `targets/dev-firebase.json`
- `candidate---dojo-time-travel-admin-q6ujypei6a-an.a.run.app` は設定上 `paperAttendance` / OCR専用接続先であり、一般E470の既定値ではない。
- `attendance_by_date` をcandidateでだけ確認した過去状態が残る場合、E470でcandidateを明示利用するか、通常接続先の配信契約を先に確定する。タグの現況は実通信直前にread-onlyで再確認する。

### 認証

- `Authorization: Bearer <Firebase ID token>` を使用する。
- サーバーは失効確認付きでID tokenを検証する。
- `attendance_progress_summary` は管理者、稼働中の先生、または本人に紐づく会員が対象範囲内で利用可能。
- `payment_reception_summary` は管理者限定。
- E470の2 actionを同じ主体で実行するため、DEV管理者claimを持つ既存テスト用認証主体を用いる。
- 既存ブラウザ処理は `currentUser.getIdToken()` を使い、401時だけ `getIdToken(true)` で一度更新する。この契約を実通信Transportでも再利用する。

## 3. action別の契約と副作用

### attendance_progress_summary（GAS / Firebase）

入力:

- 必須: `action=attendance_progress_summary`
- 必須: `member_id`
- scope: 単一会員。年月はactionへ渡さず、応答の `attendance_by_date` をE470側で明示 `target_month` に絞る。

主な応答:

- `ok`
- 会員ID・氏名・現在級段位
- `training_count`、`required_training_count`、`remaining_training_count`
- `training_days`、`required_training_days`、`remaining_training_days`
- `examination_ready`、`recent_attendance_dates`
- `attendance_by_date[]`: `{attendance_date, training_minutes, training_hours}`

読取確認:

- GAS: 会員、審査基準、級段位、出席を読み、稼働中出席の `稽古時間分` を日付別に合算する。更新関数は呼ばない。
- Firebase: member、attendances、exam standards、ranksを読み、pure projectionへ渡す。書込み処理はない。
- 取消/無効出席はactive判定から除外される。
- TimeTripに依存して対象月を選ばない。E470側の月フィルタが基準となる。

### payment_reception_summary（GAS / Firebase）

入力:

- 必須: `action=payment_reception_summary`
- 必須: `location_id`
- 必須: `billing_block_id`
- 実質必須運用: `reception_date=YYYY-MM-DD`（省略時のTimeTrip依存を避けるため）
- scope: 受付日 × 道場 × 課金枠

主な応答:

- `ok`、`reception_date`、`location_id`、`billing_block_id`
- `cash_total`、`paypay_total`、`other_total`、`total_amount`、`payment_count`
- `payments[]`
- `expected_total`、`outstanding_total`、`attendance_member_count`
- `reconciliation_items[]`

読取確認:

- GAS: `20_会費状態View` のみを読み、保存済みJSONをメモリ上で展開して集計する。更新処理は呼ばない。
- Firebase: `getSystemContext()` を読み、Firestoreのread-only transactionで道場、課金枠、会費View、請求、入金、出席、決済証跡、会員を取得する。`runTransaction(..., {readOnly:true})` を使用し、DAO proxyとUUIDは書込みを明示的に拒否する。
- Firebaseは整合性不一致時に409、取得不能時に503となり得る。GET内でView修復・upsertは行わない。
- 明示 `reception_date` を渡せば対象日・対象月は固定される。SystemContextは時計・タイムゾーン整合確認のため読まれるが変更されない。

### teacher_payment_status（GASのみ）

入力:

- 必須運用: `action=teacher_payment_status`
- 必須運用: `target_month=YYYY-MM`
- 必須運用: `date_from=YYYY-MM-DD`
- 必須運用: `date_to=YYYY-MM-DD`
- scope: 指定期間の入金と、指定月の請求グループ別状況

応答:

- `ok`、`date_from`、`date_to`、`target_month`
- `summary`: `cash_total`、`paypay_total`、`other_total`、`total_amount`、`payment_count`
- `payments[]`: 入金ID、日時、対象月、会員、請求グループ、請求、方法、金額
- `members[]`: 請求グループ、対象会員、請求件数・請求額・入金額・未払い額・稽古課金回数・状態

読取確認:

- 入金、請求、会員、出席課金回数を読むだけで、書込み処理は呼ばない。
- 値を省略すると `sup_targetMonth(ctx)` に依存するため、E470では3つの期間値を必ず明示する。
- Firebaseには同等actionがなく、共通DTOでは `UNSUPPORTED` とする。

## 4. E470の対象年月とTimeTrip

- 対象年月はExcelケースで確定した `target_month` を唯一の判定基準にする。
- `date_from` は対象月初日、`date_to` は実在する月末日を設定する。現行DTOの既定 `YYYY-MM-31` は2月等では不適切なので、実通信入力では必ず正しい月末日を明示する。
- 受付集計はExcelに列挙した `reception_date + location_id + billing_block_id` ごとに呼ぶ。
- `attendance_progress_summary` は全期間の日付別結果から対象月だけをAdapterで抽出する。
- TimeTripは参照される場合があっても変更しない。暗黙の日付・月の採用を避ける。

## 5. 認証情報とログ

- E470 Adapterの結果JSONは、action、HTTP status、対象会員/業務scopeを記録するが、request headers、Bearer token、Cookie、base URLは保存しない。
- `saveLocalResult` は共通結果DTOのみをOS一時領域へ新規保存し、既存ファイルを上書きしない。
- FirebaseサーバーはAuthorization headerを認証処理へ渡すが、確認した通常ログにtoken出力はない。
- GAS `doGet` はaction、member_id、location_id、billing_block_idと、一部集計値をLoggerへ出す。認証情報は出さないが、業務識別子がログに残る点は認識して実行する。
- GASの例外応答は現在stackを含むため、結果JSONにエラー応答本文を丸ごと保存しない。現行AdapterはHTTP 200かつ `ok:true` 以外を結果として保存せず例外化する。
- 実通信Transportは、デバッグ時にもheaders/Cookie/tokenを出力しないことを事前レビューする。

## 6. 最初に実行するGET

### GAS

最初の1件は単一DEVテスト会員の `attendance_progress_summary` とする。

```text
GET https://script.google.com/macros/s/<deploymentId>/exec?action=attendance_progress_summary&member_id=<GAS_DEV_TEST_MEMBER_ID>
```

理由: 3 action中でscopeが最小、単一会員のマスタ・出席読取のみで、TimeTripの月既定値を使わないため。GAS側に存在する専用テスト会員IDの確定が必要である。

### Firebase DEV

最初の1件は既存DEVテスト会員 `ITER004DEV_MEMBER_20261020` の `attendance_progress_summary` とする。

```text
GET https://dojo-time-travel-admin-374758850136.asia-northeast1.run.app/api/webconnect?action=attendance_progress_summary&member_id=ITER004DEV_MEMBER_20261020
Authorization: Bearer <Firebase ID token>
```

理由: 単一会員・読取専用で、書込みscopeや受付集計を伴わないため。`attendance_by_date` をcandidateだけが提供する状態なら、candidate URLへ切り替える判断を通信前に行う。

## 7. 実通信時の操作と安全確認

1. Git状態と対象設定を再確認し、コード・設定を変更しない。
2. Firebase project IDが `dojo-management-dev` であることを確認する。
3. GAS deployment IDと `access: MYSELF` を確認し、GAS専用テスト会員を確定する。
4. Firebaseは既存DEV管理者で正規ログインし、メモリ上でtokenを取得する。tokenをCLI引数、URL、ログ、結果JSONへ出さない。
5. Adapter allowlistとHTTP methodがGETのみであることを再確認する。
6. 最初は各環境で `attendance_progress_summary` 1件だけ実行する。
7. HTTP status、`ok:true`、既存進捗項目、`attendance_by_date` の有無を確認する。
8. 次に明示日付・scopeを使った `payment_reception_summary` 1件へ進む。GASのみ最後に明示期間の `teacher_payment_status` を実行する。
9. Firestore/GASの更新系ログ・TimeTrip設定・データ件数に変更がないことを確認する。
10. 取得結果は個人情報を最小化したローカルJSONへ保存し、共有・Git追加しない。

## 8. 未解決事項

- GAS外部HTTPで利用する正規認証手順（MYSELFデプロイへNodeから接続するか、所有者ブラウザセッションで確認するか）の確定。
- GAS側の専用テスト会員IDと、E470対象月に存在する受付scopeの確定。
- Firebase通常URLとcandidate URLのどちらに、E470が必要とする最新 `attendance_by_date` 契約が配信されているかのread-only再確認。
- Firebaseで使用するDEV管理者認証主体の確定。
- Excel E470の対象年月、正しい月末日、会員、受付scope、Expected値の確定。
- 現行 `createE470Input` の日付既定が月末日ではなく31日固定であるため、実通信では明示値必須。将来の局所修正候補だが、本調査では変更していない。

## 実施しなかったこと

- GAS/Firebaseへの実通信
- データ書込み、TimeTrip変更
- ソースコード・設定変更
- テスト実行
- commit、push、deploy
