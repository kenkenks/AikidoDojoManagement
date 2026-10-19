# 画面・API・テスト対応表

更新日: 2026-10-19  
版: 初版調査ベースライン  
注意: テスト名は存在確認であり、今回は再実行していない。

## 1. 共通境界

### Firebase

- 共通入口は`/api/webconnect`。
- GET/POST許可actionは`cloud/api/server.cjs`、action→operationは`shared/WebConnectCore.js`と`cloud/api/webConnect.cjs`で管理する。
- 保護処理はFirebase ID Tokenを検証し、actionごとにadminまたは道場主体をサーバーで判定する。
- `system_context`は公開の業務時計読取。
- 通常POSTは64KiB上限。`paper_attendance_ocr`だけ専用判定された6MiB上限。
- FirebaseからGASへ暗黙にフォールバックしない。

### GAS

- 読取は主に`gas/WebConnect.js`へのJSONP。
- 書込はform POST／modeと`post_receipt`を使う画面がある。
- 同名actionでもFirebase/GASで保存単位・認証・完了確認が異なる場合がある。

## 2. 対応表

| 画面ID | action／endpoint／mode | method | Firebase | GAS | 認証・権限（確認範囲） | 関連テスト |
|---|---|---|---|---|---|---|
| SCR-001 | APIなし | - | VirtualSession | 同左 | QR/URLは認可根拠でない | `verify-fw004-teacher-login.cjs`, `verify-virtual-session.mjs` |
| SCR-002 | `system_context` | GET/JSONP | 対応 | 対応 | Firebaseでは公開時計読取 | runtime config、FW004関連 |
| SCR-003 | `system_context` | GET/JSONP | 対応 | 対応 | 同上 | 専用網羅は未確認 |
| SCR-ATT-001 | `attendance_session_info`, `attendance_rank_options`, `member_attendance_state`, `attendance_saved_state` | GET | 対応 | JSONP | ID Token後、adminまたはサーバー解決主体 | attendance Step 8、session、ranks、recovery群 |
| SCR-ATT-001 | `attendance_batch` | POST | 対応 | `mode=attendance_batch` | Firebaseサーバー認可／GAS既存経路 | attendance WebConnect/core/Firestore群 |
| SCR-ATT-001 | `post_receipt` | GET | 未接続 | 対応 | GAS完了確認 | post diagnosticテスト |
| SCR-ATT-002 | 上記＋`teacher_attendance_today` | GET/POST | 対応 | 対応 | Firebaseはadminまたは解決済み先生主体 | attendance check、overview、browser群 |
| SCR-ATT-003 | `teacher_attendance_identity`, `teacher_attendance_state`, `teacher_attendance_monthly_summary`, `post_receipt` | GET | 現行Cloud Run未接続 | 対応 | GAS既存境界 | teacher attendance、overview |
| SCR-ATT-003 | `mode=teacher_attendance_sync` | POST | 未接続 | 対応 | GAS既存境界 | teacher attendance |
| SCR-ATT-004 | `attendance_progress_summary` | GET | 対応 | 対応 | Token後、対象会員Scopeをサーバー判定 | attendance summary、progress群 |
| SCR-ATT-005 | `paper_attendance_ocr` | POST | 候補版対応 | 未実装 | Token必須。adminまたは許可先生。Firestore書込なし | paper review、OCR、contact sheet |
| SCR-EXAM-001 | なし | - | 保存なし | 保存なし | 架空データ | 業務E2Eなし |
| SCR-PAY-001 | `attendance_session_info`, `getMemberInfo`, `payment_screen_read` | GET | 対応 | GASは一部別action | Firebase admin | FW002 member/screen/teacher |
| SCR-PAY-001 | `payment_cash_accept` | POST | 対応 | 未使用 | admin、request_id冪等 | cash contract/Firestore/Emulator/UI/WebConnect |
| SCR-PAY-001 | `payment_paypay_post_selected` | POST | 対応 | `mode=payment_evidence_post_selected` | admin、request_id冪等 | PayPay command/Firestore/WebConnect/Emulator |
| SCR-PAY-001 | `payment_reception_summary`, `payment_evidence_list` | GET | 前者対応。後者は`payment_screen_read`へ集約 | 対応 | Firebase admin | reception、evidenceテスト |
| SCR-PAY-001 | `mode=payment_batch` | POST | 未使用 | 対応 | GAS既存境界 | `verify-payment.mjs` |
| SCR-PAY-002 | `paypay_code_start`, `paypay_code_record` | POST | 対応 | start JSONP／record form | Firebase現行admin。正式会員認証未確定 | paypay code/Firestore/WebConnect |
| SCR-PAY-003 | `teacher_payment_status` | GET | 未接続 | 対応 | GAS既存境界 | payment status DTO等 |
| SCR-PAY-004 | なし | - | 仮表示 | 仮表示 | なし | 専用業務テストなし |
| SCR-PAY-005 | `getPaymentInfo`, `mode=payment_batch` | GET/POST | 現行画面未接続 | 対応 | GAS既存境界 | payment、session、reception群 |
| SCR-MEM-001 | `member_management_list`, `qr_generator_options` | GET | 対応 | 会員管理は非対応 | admin | member management、QR options |
| SCR-MEM-001 | `member_management_save`, `member_management_group_save`, `member_management_withdraw` | POST | 対応 | 非対応 | admin | member management |
| SCR-QR-001 | `qr_generator_options` | GET | 対応 | 対応 | Firebase admin | QR browser/DTO/options |
| SCR-ADM-001 | `/api/system/admin/time-travel`, `time_travel_admin`, `time_travel_set` | GET/POST | 対応 | 対応 | Firebase admin | time travel UI/GET/composition |
| SCR-DIAG-001 | GAS POST、`diagnostic_post_result` | POST/GET | 未対応 | 対応 | 詳細未確認 | attendance post diagnostic |
| OUT-QR-001～005 | APIなし | - | 静的 | 静的 | なし | QR generator群で間接確認 |
| GAS-ADM-001 | GAS TimeTrip処理 | GAS内部 | 非対象 | 対応 | GAS管理境界、詳細未確認 | time travel群 |

## 3. テスト群

| 分野 | 主なテスト | 確認対象 | 今回 |
|---|---|---|---|
| 仮想ログイン | `verify-virtual-session.mjs`, `verify-fw004-teacher-login.cjs` | 主体・Context・先生ログイン | 存在確認のみ |
| 出席画面/業務 | attendance check/summary、Step 8a～8i、core/DTO/schema/Firestore | 表示、契約、認可、同期、請求連携 | 存在確認のみ |
| 会費受付 | FW002 screen/teacher/cash UI/WebConnect/Emulator | 読取、現金、冪等 | 存在確認のみ |
| PayPay | code/command/Firestore/WebConnect/Emulator | REQUESTED→CONFIRMED→POSTED、冪等 | 存在確認のみ |
| 会員管理 | `verify-member-management-firebase.cjs` | 一覧、保存、グループ、退会 | 存在確認のみ |
| QR | browser/member DTO/options | URL、候補、Firebase分岐 | 存在確認のみ |
| OCR | review/OCR/contact sheet | 400セルUI、OCR、候補抽出 | 存在確認のみ |
| TimeTrip | UI/GET/composition | 管理API、画面、Firestore構成 | 存在確認のみ |
| 配信 | runtime config/hosting deploy unit | 生成物、Hosting設定 | 存在確認のみ |

## 4. 未確認

1. 全24画面のPC／スマホ実画面。
2. 戻る・再読込・認証失効時の全画面挙動。
3. GAS限定画面の現在の実URLと実機動作。
4. 旧・診断・GAS管理画面の現行利用有無。
5. QRカード5種の実寸印刷後の全パターン読取品質。
6. OCRの27セルに対する最終検出率・誤検出率。
7. 審査管理の業務APIと保存処理（現状なし）。
8. 正式な会員・先生認証方式。

## 5. 調査根拠・更新履歴

- `shared/WebConnectCore.js`
- `cloud/api/server.cjs`, `cloud/api/webConnect.cjs`, `cloud/api/admin-api.cjs`
- `gas/WebConnect.js`
- 各画面通信処理、`work/verify-*`

| 日付 | 内容 |
|---|---|
| 2026-10-19 | 24画面のaction、method、環境対応、認証、関連テストを初版保存 |
