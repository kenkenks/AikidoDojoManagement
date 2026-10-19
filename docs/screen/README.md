# 道場システム 画面現状・課題管理台帳

更新日: 2026-10-19  
対象: `web/qr` 配下23画面、および `gas/time_travel.html` 1画面  
版: 初版調査ベースライン

## 1. 目的と更新規則

本書は、画面の実装状況、検証状況、課題、次作業をチャット履歴に依存せず判断するための基準台帳である。画面ソース、WebConnect、Cloud Run/GAS実装、既存仕様書、`work/verify-*`を照合した今回の24画面調査を初版ベースラインとする。

- 画面ID、分類、パス、Firebase/GAS対応、既知課題を詳細資料でも引き継ぐ。
- 新たな事実は既存行を更新し、根拠と確認日を残す。同じ棚卸しを最初から繰り返さない。
- テストファイルの存在はPASSを意味しない。今回テストは再実行していない。
- 実装事実、既存資料、実画面結果、未確認を区別する。推測で空欄を埋めない。

| 表記 | 意味 |
|---|---|
| コード確認 | 現行ソースから確認した事実 |
| テストあり | 対応テストが存在する（今回未実行） |
| 既存資料 | Architecture／操作仕様に記載あり |
| 実画面確認 | 過去のDEV確認記録等に実測結果あり |
| 未確認 | 現時点の根拠では確定不能 |

## 2. 全画面ベースライン

### 2.1 入口・ホーム

| ID | 画面／ファイル | Firebase/GAS | 状況・検証 | 主要課題 | 次作業 |
|---|---|---|---|---|---|
| SCR-001 | システム入口 `web/qr/index.html` | 両対応 | QR・URL・VirtualSessionから先生／会員ホームへ遷移。FW004/VirtualSessionテストあり | QRは操作Contextであり認可根拠ではない。カメラ拒否等の実機表示未整理 | PC/スマホで初期、先生QR、会員QR、拒否・不正QRを確認 |
| SCR-002 | 先生ホーム `web/qr/teacher_home.html` | 両対応 | メニュー、先生Session、SystemContext、ログアウトを実装。既存操作仕様あり | 実装済み・GAS限定・試作・準備中が同じメニューに混在 | 各状態の画像と認証境界を詳細化 |
| SCR-003 | 会員ホーム `web/qr/member_home.html` | 両対応 | 出席、PayPay、出席進捗へ遷移 | 会費状況・お知らせは`href="#"`。正式会員認証未確定 | Context継承と準備中表示を実画面確認 |

### 2.2 出席・審査

| ID | 画面／ファイル | Firebase/GAS | 状況・検証 | 主要課題 | 次作業 |
|---|---|---|---|---|---|
| SCR-ATT-001 | 会員出席受付 `web/qr/attendance.html` | 両対応 | 稽古枠・保存状態・級段位取得、画面同期、`attendance_batch`を実装。Step 8系ほか多数のテストあり | URLの`member_id`は認可根拠ではない。実機全状態未整理 | fixtureで登録・解除・再読込・認証/通信エラーを確認 |
| SCR-ATT-002 | 先生用出席確認 `web/qr/attendanceCheck.html` | 両対応 | 会員出席機能と本日一覧・並替えを実装。専用Firebaseテストあり | メニュー名が「仮ページ」。スマホ連続読取未整理 | QR連続読取、3種並替え、保存後同期を実機確認 |
| SCR-ATT-003 | 先生出席 `web/qr/teacher_attendance.html` | GAS実装、Firebase未接続 | 先生識別、状態取得、同期POST、月次集計。関連テストあり | 現行Cloud Run許可action未接続。将来廃止案は未決定 | GAS実画面と現行責務を記録し、移行/維持/廃止を判断 |
| SCR-ATT-004 | 出席・審査進捗 `web/qr/attendance_summary.html` | 両対応 | `attendance_progress_summary`を表示。専用テストあり | ARCH-024の審査日程・結果管理は未実装 | 本人スコープ、0件、境界値、スマホ表示を確認 |
| SCR-ATT-005 | 紙の出席記録取込 `web/qr/paper_attendance_review.html` | Firebase候補版 | 画像、四隅、20×20表、セル修正、集計、OCRを実装。OCR/画面/contact-sheetテストあり | OCR精度評価中。Firestore差分照合・確定登録なし。候補URL接続 | 27セル正解表で方式を決め、登録工程は後続設計 |
| SCR-EXAM-001 | 審査管理 `web/qr/examination/index.html` | 共通静的 | 架空データの絞込・疑似操作のみ。保存なし | 日程、対象者、結果文章/日、保留/確定、履歴未実装 | ARCH-024に沿ってDTO/DAO/権限境界から段階実装 |

### 2.3 会費・決済

| ID | 画面／ファイル | Firebase/GAS | 状況・検証 | 主要課題 | 次作業 |
|---|---|---|---|---|---|
| SCR-PAY-001 | 先生用会費受付 `web/qr/payment_teacher.html` | 両対応（保存方式別） | 会員、未払い、現金、集計、PayPay確認/反映。FW002・現金・PayPayテストとDEV確認記録あり | Firebaseは単件即時、GASは画面蓄積後一括 | 両版の正常、再送、結果不明、0件、権限エラーを記録 |
| SCR-PAY-002 | 会員PayPayコード登録 `web/qr/paypay_code.html` | 両対応 | start/record、DEVコード、REQUESTED→CONFIRMED。関連テスト・DEV確認記録あり | Firebaseは現行admin認証。正式会員認証・正式コード仕様未確定 | デモ仕様と将来仕様を分離して記載 |
| SCR-PAY-003 | 会費状況 `web/qr/payment_status.html` | GAS限定 | `teacher_payment_status`参照。DTOテストあり | Cloud Run actionなし | 必要性確認後、既存Reader再利用の移行計画 |
| SCR-PAY-004 | 決済コード確認（仮） `web/qr/paymentEvidence.html` | 静的試作 | 入力と仮メッセージのみ。保存なし | 実処理は会費受付にあり役割重複 | 廃止・名称変更・正式接続を判断 |
| SCR-PAY-005 | 旧会費受付 `web/qr/payment.html` | 主にGAS旧経路 | QR、受付リスト、集計、一括POST。関連テストあり | 現行メニューから入口なし。存在しない`home.html`リンク | 利用実態を確認し、互換維持かアーカイブか決定 |

### 2.4 会員・管理・診断

| ID | 画面／ファイル | Firebase/GAS | 状況・検証 | 主要課題 | 次作業 |
|---|---|---|---|---|---|
| SCR-MEM-001 | 会員管理 `web/qr/member_management.html` | Firebase限定 | 一覧、検索、新規/編集/退会、1～5人グループ、料金候補。専用テスト・DEV公開記録あり | 候補は月次プラン確定ではない。GAS版なし | テスト会員で全主要状態を撮影・確認 |
| SCR-QR-001 | QR生成 `web/qr/qr_generator.html` | 両対応 | 先生+道場、会員、支払QR、印刷リスト、B5横8分割。関連テストあり | 印刷品質、スマホ操作、現行QR互換の実機確認 | 8/9枚、日本語、重複、全カードを実機確認 |
| SCR-ADM-001 | テスト日時操作 `web/qr/time_travel.html` | 両対応（実装別） | Firebase管理者日時設定/解除/診断、GAS経路。関連テストあり | 開発管理画面。通常利用者向けでない | 開発者資料へ分離し入口・権限を明示 |
| SCR-DIAG-001 | POST疎通診断 `web/qr/post_diagnostic.html` | GAS診断 | iframe POSTとreceiptポーリング。関連テストあり | 通常業務外。正式な利用入口未確認 | 診断用途・アクセス条件・廃止条件を整理 |

### 2.5 印刷・プレビュー

| ID | 画面／ファイル | Firebase/GAS | 状況・検証 | 主要課題 | 次作業 |
|---|---|---|---|---|---|
| OUT-QR-001 | 道場QR `web/qr/sheets/dojo.html` | 静的 | クエリからカード描画。QR生成テストで間接確認 | 実寸・余白・読取距離 | B5/PDF/実寸読取確認 |
| OUT-QR-002 | 先生カード `web/qr/sheets/teacher.html` | 静的 | 先生＋道場カード描画 | 氏名・道場名・URL一致 | 複数カード、日本語、実機読取 |
| OUT-QR-003 | 会員カード `web/qr/sheets/member-card.html` | 静的 | 会員カード描画 | 既存QR互換性 | 旧カードとのURL比較・実機読取 |
| OUT-QR-004 | 月謝QR `web/qr/sheets/payment-monthly.html` | 静的 | 月謝カード描画 | 現行運用での必要性 | 利用有無・QR仕様確認 |
| OUT-QR-005 | 都度支払いQR `web/qr/sheets/payment-onetime.html` | 静的 | 都度支払カード描画 | 課金枠QR通常不要方針との関係 | 出力を残すか運用確認 |

### 2.6 GAS別実装

| ID | 画面／ファイル | Firebase/GAS | 状況・検証 | 主要課題 | 次作業 |
|---|---|---|---|---|---|
| GAS-ADM-001 | GASテスト日時操作 `gas/time_travel.html` | GASのみ | GASプロジェクト側管理画面。関連テストあり | Web版との責務重複・配信入口未確認 | GAS配信経路と利用状況を調査 |

## 3. HTMLを持たない準備中入口

- 先生ホーム「月次処理」「お知らせ」: `href="#"`
- 会員ホーム「会費状況」「お知らせ」: `href="#"`

## 4. 横断課題

1. VirtualSessionは画面Contextであり本人認証ではない。
2. Firebase管理者ログイン、先生QR、会員QRの役割が混在する。
3. GAS限定、Firebase限定、両対応の操作差を画面上で十分に説明していない。
4. 試作画面と業務画面が同じメニューに並ぶ。
5. 旧画面・診断画面の存廃と正式入口が未確定。
6. PC/スマホ、正常/エラー、保存前/後の画像台帳は次工程。
7. 自動テスト、DEV実画面、スマホ実機を別々に完了管理する必要がある。

## 5. 調査根拠

- `web/qr/**/*.html`, `web/qr/*.js`, `gas/time_travel.html`
- `shared/WebConnectCore.js`
- `cloud/api/server.cjs`, `cloud/api/admin-api.cjs`, `cloud/api/webConnect.cjs`
- `gas/WebConnect.js`
- `docs/manual/teacher/TEACHER_OPERATION_SPEC.md`
- `docs/Architecture/ARCH-VIRTUAL-LOGIN-001.md`
- `docs/Architecture/ARCH-024_EXAMINATION_PROMOTION_MANAGEMENT.md`
- `docs/Architecture/STEP-8A_ATTENDANCE_FIREBASE_MIGRATION.md`
- `docs/Architecture/STEP-8B_ATTENDANCE_AUTHORIZATION_BOUNDARY.md`
- `work/verify-*`

## 6. ベースライン更新履歴

| 日付 | 内容 | 根拠 |
|---|---|---|
| 2026-10-19 | 24画面の初版棚卸し。画面分類、ID、パス、対応環境、課題、次作業を確定 | 上記リポジトリ調査 |
