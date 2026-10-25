# 先生向け稽古・審査進捗管理 第3工程

## 結論

既存の先生用出席画面 `attendanceCheck.html` の進捗一覧を再利用し、Firebaseでは全在籍会員の一括進捗を表示するようにした。新規画面は作成していない。先生ホームの既存導線名を「出席・稽古進捗」へ更新した。

## Firebase表示

- `teacher_attendance_progress` を1回だけGETする。
- `progress_items` を既存の級順、審査が近い順、氏名順で並べ替える。
- 会員名、現在級・段位、次の級・段位、必要枠、承認済み枠、達成率、残り枠を表示する。
- 承認済み枠は `recorded_training_count`、達成率と残り枠は繰越を含む既存進捗値に基づく。
- 繰越がある場合は内訳を表示する。
- 読み込み中、対象会員なし、取得エラーを別表示する。
- 520px以下では進捗欄を次行にしてスマートフォン幅へ対応する。

達成率は一括readerが `progress_percent` として返す。画面では再計算しない。既存projectorの `training_count` と `required_training_count` から派生するため、進捗判定ロジック自体は変更していない。

## GAS互換

GASでは従来どおり `teacher_attendance_today` を使用し、本日の出席者だけを表示する。既存の道場・課金枠条件とソートを維持した。誤って付いていた `H` 表示は「枠」へ修正した。

## 変更ファイル

- `cloud/attendance/progress-firestore.cjs`
- `web/qr/attendance_firebase_read.js`
- `web/qr/attendanceCheck.html`
- `web/qr/teacher_home.html`
- `work/verify-attendance-progress-batch-firestore.cjs`
- `work/verify-teacher-progress-overview-ui.cjs`

## 検証結果

- UI契約: PASS
- 一括DTO、認可、既存会員単体進捗、既存先生画面、HTTP回帰: 47/47 PASS
- `git diff --check`: PASS
- `npm run target:build -- dev-firebase`: PASS
- 配信依存関係: 47ファイル PASS

## 未実施

受審可能時期の予測、第5工程の総合性能・実環境検証、push、deploy、実通信は未実施。
