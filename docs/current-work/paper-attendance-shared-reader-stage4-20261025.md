# 紙出席簿読み取り共通化 第4段階

## 結論

既存の WebConnect `attendance_batch`、Firestore transaction、Attendance DTO の `状態` を再利用し、会員本人による紙出席を `確認待ち` で登録する経路を実装した。新規API・Schema追加はない。先生の既存紙取込は、サーバーで有効先生を確認して `有効` 状態で登録する従来動作を維持する。

## 変更ファイル

- `cloud/api/admin-api.cjs`: OCR本人認可、会員紙出席の本人限定認可、信頼済みサーバーフラグ付与
- `adapters/firestore/DAO_Core.js`: 会員紙出席入力、transaction内の信頼境界
- `gas/04_Attendance.js`: 共通業務処理で会員経路を確認待ち・取消なし・課金なしに固定
- `cloud/attendance/saved-state.cjs`: 確認待ちを重複防止対象へ追加（従来DTOは確認待ちがない場合に維持）
- `web/qr/paper_attendance_reader.js`: 会員確認待ち差分送信と再送防止
- `web/qr/paper_attendance_review.js`: 共通UIから先生／会員登録Executorを選択
- `web/qr/paper_attendance_member.html`, `paper_attendance_member_adapter.js`: 会員送信UI・既存認証WebConnect writer・紙専用scope接続
- `work/verify-fw001-registration.cjs`, `verify-paper-attendance-ocr.cjs`, `verify-paper-attendance-member-reader.cjs`, `verify-initialization-step8b.cjs`: 契約・回帰テスト更新
- `work/verify-paper-attendance-member-pending.cjs`: 会員確認待ち差分送信テスト

## 認可と状態

- OCR: admin／有効先生に加え、Firestoreの既存principal解決で `member_id` が本人一致する会員のみ許可。会員IDはOCR upstreamへ渡さない。
- 登録: `source=paper_attendance_member` は本人一致、空teacher、`skip_billing=true` が必須。クライアントの `autoApprove`／`initial_status` は権限・状態に使わない。
- サーバーが `member_submission_authorized=true` を内部付与し、状態を必ず `確認待ち`、`sync_unselected=false`、payment view更新なしへ固定する。
- 他人登録、先生payloadへの昇格、未認証はDAO書込み前に拒否する。

## 重複と集計

- `attendance_saved_state` は `確認待ち` のslotも `selected_slot_ids` に含め、必要な場合だけ `pending_slot_ids` を返す。
- 同一日・同一slotは既存Attendance Coreがtransaction内でretainし、再作成しない。
- 会員画面は確定時間との差分から必要数を計算し、既存の確認待ち数を差し引く。
- `progress-summary.cjs` の有効状態条件は変更していないため、`確認待ち` は出席時間・審査進捗に加算されない。
- 請求・月次選択・会費Viewは会員紙経路で書き込まない。

## テスト

- DEV build: PASS（46 reachable files、構文・依存関係）
- Firebase registration: 15/15 PASS
- 会員pending executor: 3/3 PASS
- OCR: 14/14 PASS
- 紙レビュー: 36/36 PASS
- 紙登録: 16/16 PASS
- 初期化: 4/4 PASS
- saved-state: 2/2 PASS
- GAS/Firebase saved-state parity: 6/6 PASS
- `git diff --check`: PASS
- 集約 `verify-fw001.cjs`: 今回関連220件はPASS。既存dirty `attendance_summary.html` に依存するbrowser mock 3件は本変更外の既知失敗だったため、コミット対象外として保全。

## 未完成

- 第5段階の先生承認画面・承認コマンド接続は未着手。
- 実Firebase通信・実機・Firestore書込みは未実施。
- DEV Hosting／Cloud Runへの配信は未実施。
