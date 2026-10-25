# 先生向け稽古・審査進捗管理 第1工程

## 結論

Firebase用の全会員進捗一括readerを追加した。会員、出席、級段位、審査基準をコレクション単位でページ取得し、会員別に分類した後、既存の `projectAttendanceProgress` を適用する。画面、WebConnect、GAS版は変更していない。

## 変更ファイル

- `cloud/attendance/progress-firestore.cjs`
  - 単体readerと一括readerで級段位・審査基準の正規化を共用
  - `createFirestoreProgressBatchReader` を追加
  - 一括DTOは `ok`、`member_count`、既存会員DTOと同形の `progress_items` で構成
- `work/verify-attendance-progress-batch-firestore.cjs`
  - 一括／単体DTO一致、状態判定、重複排除、繰越、起算日、退会者除外、未設定、ページング、取得回数を検証

## 取得方式

`members`、`attendances`、`examination_standards`、`ranks` をそれぞれページ取得する。会員ごとの `readById` と `queryEqual` は実行しないため、取得回数は会員数に比例しない。ページサイズは100件、通常コレクションは最大100ページ、マスタは既存上限と同じ最大10ページで、不完全な結果はエラーにする。

在籍判定は既存契約どおり空文字、`有効`、`在籍`、`TRUE`。確認待ちは既存projectorにより除外され、`確認済`は集計される。同日同slotは既存projectorの一意キーで重複排除される。

## 検証結果

- 新規一括readerテスト: 5/5 PASS
- 既存進捗・Firebase契約テスト: 14/14 PASS
- 確認待ち承認回帰: 10/10 PASS
- JavaScript構文: PASS
- `git diff --check`: PASS
- `npm run target:build -- dev-firebase`: PASS
- 配信依存関係: 47ファイル PASS

## 未実施・次工程

一括readerはまだ `server.cjs`、WebConnect、先生画面へ接続していない。第2工程で先生限定のread actionへ接続する。push、deploy、実データ通信は実施していない。
