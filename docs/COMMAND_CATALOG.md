# コマンド台帳（仮置き）

> 目的：忘れても探し直せるように、存在と一行概要だけ記録する。
> 未整理・未検証の記録を許容する。整合性確認、統合、廃止判定は後回し。
> 出典：AikidoDojoManagement-main(112).zip 内のファイル名。実行可否・引数・副作用は未検証。

## Migration
- `work/plan-member-firestore-migration.cjs` — Member移行計画。
- `work/dry-run-member-firestore-migration-real.cjs` — 実Firestore対象のMember移行事前確認。
- `work/execute-member-firestore-migration.cjs` — Member移行実行。
- `work/apply-member-firestore-migration-real.cjs` — 実FirestoreへのMember移行適用。**書込注意**。
- `schema/migration/Member/Member.mapping.json` — Memberマッピング定義（コマンドではない）。

## 変換・Copy
- `work/copy-field-names.cjs` — GAS項目名→Firestore項目名の変換支援。
- `schema/copy-field-glossary.json` — 項目名の変換辞書（コマンドではない）。
- `work/gas2firebase-copy.cjs` — GAS→Firestoreコピー。**書込の可能性あり、実行前に要確認**。

## Batch
- `work/command-batch.cjs` — コマンド一括実行。
- `work/batch/remaining-masters.json` — 残マスターのバッチ定義（コマンドではない）。

## Verify
- `work/verify-copy-field-names.cjs` — フィールド名変換の検証。
- `work/verify-gas2firebase-copy.cjs` — コピー処理の検証。
- `work/verify-command-batch.cjs` — バッチ処理の検証。
- `work/verify-member-firestore-migration-plan.cjs` — Member移行計画の検証。

## 既存コマンド集
- `docs/firebase/FIREBASE-COMMANDS.md` — Firebase関連。
- `docs/gas/GAS-COMMANDS.md` — GAS関連。

## あとで確認すること（今は対応しない）
- 各コマンドの正確な引数・副作用・利用状況。
- MigrationとCopyの接続可能性。
- 日本語複合キーの生成箇所と正式IDへの切替。
- 全コマンドの収集・分類・重複確認。

## 現在の主目的
運用に必要なマスターのGAS→Firestore一括コピー。対応済みは個別作業をスキップし、最後に全体検証。
