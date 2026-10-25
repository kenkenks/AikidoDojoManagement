# 紙出席読み取り共通化 第2段階（先生画面接続）

## 結論

基準コミット `9f3d42e` の共通モジュール `paper_attendance_reader.js` を、既存の先生用画面 `paper_attendance_review.html` / `.js` へ接続した。先生画面に残っていたOCR割当、400セル編集支援、日付別差分計算、登録レコード組立て・逐次登録の重複実装は削除し、共通readerを唯一の実装とした。

先生用Adapterは `audience: "teacher"`、`autoApprove: true` を宣言する。ただし、この値は画面構成の指定に限定し、`attendance_batch` のpayloadへ送信していない。第4段階のサーバー側権限判定を先取りせず、現行の先生用登録動作を維持している。

## 変更ファイル

- `web/qr/paper_attendance_reader.js`
  - 先生画面固有部でも使用する正規化済み全面四隅 `IDEAL_CORNERS` を公開APIへ追加。
- `web/qr/paper_attendance_teacher_adapter.js`
  - 先生用の画面Adapterを新設。`autoApprove=true` を宣言。
- `web/qr/paper_attendance_review.html`
  - Adapter、共通reader、先生UIの順で読み込むよう変更。
- `web/qr/paper_attendance_review.js`
  - 93行相当の共通ロジック複製を削除し、`DOJO_PAPER_ATTENDANCE_READER` を参照。
  - 共通readerまたは先生Adapterがない場合はfail-closedで初期化を停止。
  - 既存の画面イベント、Firebase認証、OCR、差分表示、登録経路は維持。
- `work/verify-paper-attendance-reader-common.cjs`
  - Adapter契約、読込順、重複実装除去、権限指定のpayload非混入を検証。
- 本文書。

## 検証結果

- JavaScript構文: PASS（reader / teacher adapter / review）
- 共通reader接続契約: PASS（20関数、定数、Adapter、読込順、重複除去）
- 先生画面契約: 36/36 PASS
- 差分登録・二重登録防止: 16/16 PASS
- Gemini OCR境界: 13/13 PASS
- Attendance DTO: 2/2 + 3/3 PASS
- 初期化管理: 4/4 PASS、step 9.1 PASS
- `npm run target:build -- dev-firebase`: PASS
- 配信依存関係: 46ファイル PASS
- ソースとDEVビルド成果物のSHA-256: 対象4ファイルすべて一致
- 既存iPhone実画像の統合回帰: PASS
  - 21×21罫線検出成功
  - 400カード生成成功
  - 既知記入セル 27/27
  - WASMヒープ 139.6875 MiB
  - 今回のローカル処理時間 302,665 ms
- `git diff --check`: PASS

## 新旧動作差

利用者操作、OCR入力・結果、400セル編集、差分算出、既存の登録payloadに意図した差はない。実装上の差は、純粋ロジックの参照先が先生画面内の複製から共通readerへ変わったことと、先生用Adapterが明示されたことだけである。

## 未完成部分

- 会員画面への接続（第3段階）は未実装。
- `autoApprove` に対するサーバー側の先生権限判定（第4段階）は未実装。
- 確認待ち出席の登録・先生承認（第4～5段階）は未実装。
- push / deploy は実施していない。

## 保全事項

STORY-902、PoC出力、実測JSON、実データバックアップ、既存の無関係な未コミット差分は変更・ステージングしていない。
