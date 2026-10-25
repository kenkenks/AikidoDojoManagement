# 紙出席読み取り共通化 第3段階（会員画面接続）

## 結論

基準コミット `6fba2f3` から、会員用の薄いHTML台紙とMember Adapterを追加し、先生画面と同じ `paper_attendance_reader.js` および `paper_attendance_review.js` へ接続した。OCR結果のセル割当、400セル確認・修正、日付別集計、確定済み出席との差分計算は共通実装である。

会員Adapterは `audience: "member"`、`autoApprove: false`、`registrationEnabled: false` を宣言する。第4段階の確認待ち登録経路がない現段階では、会員画面から既存の承認済み出席登録へ到達できないよう、登録UI、登録準備、登録確認、登録実行、書込みモジュール、先生用紙取込scopeの全てを無効化または非読込としている。

## 変更ファイル

- `web/qr/paper_attendance_member.html`
  - 会員向け台紙。先生用と同じ画像・OCR・400セル・差分確認DOM契約を使用。
  - 登録パネルを非表示とし、既存承認済み出席writerと先生用scopeを読み込まない。
- `web/qr/paper_attendance_member_adapter.js`
  - `autoApprove=false`、`registrationEnabled=false` を宣言。
- `web/qr/paper_attendance_teacher_adapter.js`
  - 既存先生動作を明示する `registrationEnabled=true` を追加。
- `web/qr/paper_attendance_review.js`
  - Teacher / Member Adapterの双方を受け付ける共通画面コントローラへ拡張。
  - 会員セッション本人を対象会員として固定し、他会員への切替を禁止。
  - 会員向け初期化では `system_context` と本人の `attendance_progress_summary` のみ取得。
  - 会員モードでは登録機能を複数箇所でfail-closedにした。
- `web/qr/member_home.html`
  - 会員用紙出席記録読取への導線を追加。
- `work/verify-paper-attendance-member-reader.cjs`
  - Adapter、共通reader読込順、会員本人固定、登録遮断、writer/scope非読込を検証。
- `work/verify-initialization-step8b.cjs`
  - 先生・会員それぞれの任意初期化タスク契約を検証。
- 本文書。

## 登録遮断

1. 会員HTMLでは登録パネルを非表示。
2. Member Adapterは `registrationEnabled=false`。
3. 共通コントローラの `registrationEnabled` はTeacher Adapterの場合だけtrueになる。
4. 登録内容確認と登録実行の入口で `registrationEnabled` を再検査。
5. 登録直前の世代検査でも `registrationEnabled` を再検査。
6. 会員HTMLは `attendance_firebase_read.js`（現行の承認済み出席writerを含む）と `paper_attendance_scope.js` を読み込まない。
7. `autoApprove` は登録payloadへ含めない。

## 検証結果

- JavaScript構文: PASS
- 会員画面共通reader・登録遮断契約: PASS
- 共通reader契約: PASS（20関数）
- 先生画面契約: 36/36 PASS
- 差分登録回帰: 16/16 PASS
- Gemini OCR境界: 13/13 PASS
- DTO回帰: 2/2、3/3 PASS
- 初期化管理: 4/4 PASS、step 9.1 PASS
- `npm run target:build -- dev-firebase`: PASS
- 配信依存関係: 46ファイル PASS
- 会員画面・Adapter・共通JS・会員ホームのDEV生成物SHA-256: 全件一致
- `git diff --check`: PASS

## 未完成部分・注意点

- 会員からの「確認待ち」保存とサーバー側権限判定は第4段階で未実装。
- 先生による確認待ち出席の承認処理は第5段階で未実装。
- 現行Cloud Runの `paper_attendance_ocr` 認可はadminまたは有効な先生を対象としている。会員Firebase principalでの実OCR許可は第4段階のサーバー境界設計時に判断が必要であり、本段階では認可を緩和していない。
- 実ブラウザ通信、Firestore書込み、push、deployは実施していない。

## 保全事項

STORY-902、PoC出力、実測JSON、実データバックアップ、既存の無関係な未コミット差分は変更・ステージングしていない。
