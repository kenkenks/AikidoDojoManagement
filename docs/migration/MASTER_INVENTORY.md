# GAS → Firestore 全マスタ棚卸し（ソースコード確認版）

基準: AikidoDojoManagement-main(95).zip に FieldGlossary v1 の更新を重ねたローカルソース。2026-10-10。

| GASシート | 取得関数 | 状態 | 備考 |
|---|---|---|---|
| 01_会員マスタ | getMembers | Copy済み（22件、ユーザー報告） | Memberフィールドの意味的な列対応は再確認対象 |
| 03_料金マスタ | getFees | 未Copy | 料金プラン |
| 03_料金プラン選択ルール | getPlanSelectionRules | 未Copy | マスタ相当の設定ルール |
| 10_道場マスタ | getLocations | Copy済み（2件） | dojos |
| 11_先生マスタ | getTeachers | Copy済み（4件） | teachers |
| 12_稽古枠マスタ | getTrainingSlots | 未Copy | 出席動作の依存候補 |
| 13_課金枠マスタ | getBillingBlocks | 未Copy | 会費の依存候補 |
| 14_級段位マスタ | getRankMasterRows | 未Copy | ランク表示の依存候補 |
| 15_審査基準マスタ | getExaminationStandardRows | 未Copy | 審査進捗の依存候補 |

## 棚卸し範囲と留保

上表は `gas/sheetContext.js` と `gas/04_ExaminationStandard.js` の明示的なシート参照から抽出したもの。実際のスプレッドシートの全タブ一覧・実ヘッダーは未取得。『経費タイプ』という独立マスタは今回確認したコード上では未特定であり、別の設定／辞書／料金定義にある可能性を残す。Dictionary、ID、Setting等はマスタ同等の基盤データだが、機密・採番・環境依存があるため無条件の全件Copyから除外して別途確認する。

## 安全な一括Copyの実施条件

1. 未移行シートの実ヘッダー、レコード件数、主キー、値型をGASから**読み取り専用**で採取する。
2. Schemaと英語名対応を確定し、既存 `work/gas2firebase-copy.cjs` に対象を追加する。未知フィールド、型不一致、英語名重複は停止。
3. すべてPreflight成功、次に各テーブル1件の書き込み・Read-back成功を確認する。
4. 一括 `--execute --confirm dojo-management-dev` を実行し、最後に `--verify-existing` で全件照合する。
5. 全マスタCopyは画面・DAOのFirestore接続完了を意味しない。出席登録等は別途E2E検証。

現時点で未移行6シート（03料金、03選択ルール、12、13、14、15）のSchema・GAS runnerは揃っておらず、今すぐ全件書き込みできる状態ではない。実データの列名・主キーを推測して作成することは避ける。
