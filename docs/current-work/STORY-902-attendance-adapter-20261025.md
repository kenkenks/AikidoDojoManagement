# STORY-902 工程① 出席登録共通Adapter

## 目的と範囲

STORY-902の目的は、Excel「902イベント」の47イベントを仮想日時順に既存WebConnect経由で連続実行し、月末整合性を検証することである。本工程では26件の`ATTENDANCE_REGISTER`をイベント別実装にせず、E010で確認済みの契約へ接続する共通Adapterを作成した。実通信、Firestore、TimeTrip、API追加は行っていない。

## 既存契約との接続

- 経路: Manifest → 共通Adapter → `POST attendance_batch` → 既存出席登録処理
- POST入力: `request_id`、`attendance_session_id`、`attendance_date`、`teacher_id`、`location_id`、`billing_block_id`、`attendance_items[]`
- item入力: `member_id`、`current_rank`、`plan_id`、`slot_ids[]`
- 応答照合: `registered_count`、`cancelled_count`、対象会員の`usage_billing[].charge_count/planned_amount`
- read-after-write: `member_attendance_state`と`getMemberInfo`
- 仮想日時: `executionDateTime`をAdapter結果へ引き渡すだけで、POST payloadへ注入しない。実際の日時設定は既存TimeTrip controllerの責務とする。
- E010の公開関数は互換facadeに残し、処理本体の二重実装を除去した。

## 代表イベントの契約確認

| Event | 原本条件 | 確定した共通契約 | 現在の判定 | 未確定事項 |
|---|---|---|---|---|
| E020 | 2027-07-02、M002、P001月払い | `ATTENDANCE_REGISTER`、`POST attendance_batch` | BLOCKED | 実行時刻、M002 fixture、P001期待請求、Expected HTTP/業務値 |
| E030 | 2027-07-02、M005-2、P011家族 | 同上 | BLOCKED | 実行時刻、家族関係を含むfixture、P011期待請求、Expected HTTP/業務値 |
| E070 | 2027-07-04、M006、P020ビジター | 同上 | BLOCKED | 実行時刻、visitor fixture、P020の請求・明細期待値、Expected HTTP/業務値 |
| E080 | 2027-07-04、M007、P021体験 | 同上 | BLOCKED | 実行時刻、trial fixture、P021の無償条件・請求期待値、Expected HTTP/業務値 |

4件ともExcel行順は`rowOrderCandidate`にすぎず、`dependencies.businessData/executionOrder`は空である。候補順を確定依存へ昇格していない。cleanupについても代表4件の専用fixtureと業務生成レコードの所有証跡が未確定のため、推測で実装していない。

## 実装

- `work/story902-attendance-business-adapter.cjs`
  - 任意の出席登録eventIdをManifestから解決する。
  - B-1 Manifest検証、B-2継続判定を再利用する。
  - 実行日時、fixture、plan、Expectedを検証し、不足を機械可読な`blockers[]`で返す。
  - 条件成立時のみ既存`attendance_batch`要求を構築する。
  - Mock Transport限定、全経路`businessExecutionAllowed=false`、UNKNOWN自動再送禁止を維持する。
- `work/story902-e010-business-adapter.cjs`
  - 既存C-2向け互換facade。E010の公開契約と23テストを維持する。
- `work/verify-story902-attendance-business-adapter.cjs`
  - 26件認識、E010互換、代表4件BLOCKED、依存候補非昇格、transport未呼出しを検証する。

## 26件への適用見込み

Manifest上の26件は全件、共通Adapterの対象種別として識別できる。現時点で実行契約が完全に確定しているのはE010の1件のみで、残る25件は各イベントの`executionDateTime`、fixture、料金プラン別Expectedを確定するまでBLOCKEDとする。共通化により、確定後はイベント別Adapterを追加せずManifest/fixture/Expectedを供給して接続できる。

## テスト結果

- 共通Adapter: 8/8 PASS
- 既存E010 Adapter: 23/23 PASS
- B-1 Manifest Loader: 13/13 PASS
- B-2 Continuation Gate: 15/15 PASS
- B-3 Pre-execution / TimeTrip Controller: 25/25 PASS
- 本工程で再実行した関連テスト合計: 84/84 PASS
- 構文チェック: PASS
- 実Event送信、Firebase/Firestore接続、TimeTrip変更: なし

## 未確定事項と次工程

優先順は、(1)同日イベントの時刻補完規則、(2)M002/M005-2/M006/M007 fixture、(3)P001/P011/P020/P021の期待請求・明細、(4)read-after-writeで料金タイプ別に確認すべき項目、(5)cleanup所有証跡である。次に着手する業務種別は、件数が多く既存WebConnect契約を再利用できる現金受付（`CASH_PAYMENT`）を推奨する。
