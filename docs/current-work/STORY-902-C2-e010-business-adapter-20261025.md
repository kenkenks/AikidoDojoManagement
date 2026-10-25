# STORY-902 C-2 E010 Business Adapterモック実装

作成日: 2026-10-25  
基準: `main` / `ccd0486`  
範囲: ローカル実装とMock Transport検証のみ。実API、Firebase、Firestore、TimeTripへの接続および永続化は未実施。

## 1. 結論

E010専用Business Adapterを、B-1 Manifest検証とB-2継続判定を再利用して実装した。Adapterは既存`POST attendance_batch`形式への入力変換、注入Transportの1回呼出し、応答の正規化、Manifest Expectedとの比較、既存GET契約を模擬したread-after-write確認だけを担当する。出席登録・料金計算は再実装していない。

Mock Transport以外はコンストラクタで拒否し、すべての結果で`mockExecution=true`、`businessExecutionAllowed=false`、`autoRetryAllowed=false`を維持する。モックの`PASS`は実DEVの実行実績ではない。

## 2. 変更ファイル

- `work/story902-event-manifest.json`
  - 既存E010 manifest/Judgeに存在した4つの数値Expectedを、47イベントManifestのE010へ構造化統合した。
- `work/story902-e010-business-adapter.cjs`
  - E010入力検証、要求構築、応答正規化、Expected照合、read-after-write判定、再送禁止を実装した。
- `work/verify-story902-e010-business-adapter.cjs`
  - Mock Transportだけを用いる18テストを追加した。
- `docs/current-work/STORY-902-C2-e010-business-adapter-20261025.md`
  - 本記録。

既存B-1/B-2/B-3、業務API、DAO、DTOは変更していない。

## 3. Manifest Expectedの統合

C-1で確認したとおり、47イベントManifestにはE010の数値Expectedが構造化されていなかった一方、既存E010 manifest/Judgeには次が確定値として存在した。Manifestを唯一のイベント定義とするため、同じ値を`expected.businessValues`へ統合した。

- `registered_count = 1`
- `cancelled_count = 0`
- `usage_billing_charge_count = 1`
- `planned_amount = 1500`

出典は`EXISTING_E010_MANIFEST_AND_JUDGE`、状態は`CONFIRMED`として記録した。値をAdapterやテストへ独立定義して判定する構造にはしていない。

## 4. 入力契約

`createCommand()`は次をすべて確認し、不成立時はTransportを呼ばず`BLOCKED`を返す。

1. Manifest全体がB-1検証を通過する。
2. `eventId`が`902-E010`で、event typeが`ATTENDANCE_REGISTER`、操作名が`出席登録`である。
3. B-2でE010が継続候補になる。仕様未確定イベントは候補にならない。
4. Run ID、request ID、session IDが妥当である。
5. fixtureにExcel別名、実会員、先生、道場、課金枠、稽古枠、現在級がある。
6. fixtureの`source_member_id=M001`がManifestの`memberId=M001`と一致する。
7. Manifestの対象日、実行日時、plan、構造化Expectedが解決済みである。

構築する既存契約は次のとおり。

```text
POST attendance_batch
  request_id
  attendance_session_id
  attendance_date = 2027-07-02
  teacher_id / location_id / billing_block_id
  attendance_items[0]
    member_id = STORY902_M001
    current_rank = 成人無級
    plan_id = P002
    slot_ids = [STORY902_S001]
  source = story902_e010
```

Manifestにないfixture実IDを推測せず、呼出側から明示された値だけを使用する。

## 5. 出力契約とJudge

成功応答はHTTP 2xxかつ`body.ok=true`を要求する。`usage_billing`は配列先頭ではなく対象`member_id`で一意に選択し、次の共通Actualへ正規化する。

```text
registered_count
cancelled_count
charge_count
planned_amount
```

4項目をManifest Expectedと厳密比較する。欠損・型不正は補完せず`UNKNOWN / RESPONSE_FORMAT_INVALID`とする。

read-after-writeは注入Transportで以下を模擬した。

- `member_attendance_state`: 対象会員、登録slot、P002選択を確認。
- `getMemberInfo`: 対象会員、`2027-07`、請求合計1,500円を確認。

送信応答のExpected一致とread-after-writeの双方が一致したときだけ、結果モデル上の`PASS`を返す。ただし証跡種別は常に`MOCK_ONLY`である。

## 6. 状態分類

- `PASS`: Mock応答とMock read-after-writeがExpectedに一致。
- `FAIL`: 明示的業務エラー、Expected不一致、read-after-write不一致。
- `BLOCKED`: Manifest/候補/入力不成立、401/403、同一Runの再試行。
- `UNKNOWN`: 通信失敗、タイムアウト、応答喪失、不正成功応答、書込後の再読取不能。

通信障害では書込成否を判断できないため`UNKNOWN`とし、自動再送しない。同一Adapterインスタンスでは送信開始前にRun IDとevent IDを記録する。同一Runの再実行は`AUTOMATIC_RETRY_PROHIBITED`、別Run ID・別request ID・異なるfixtureによる同じE010の再実行も`EVENT_REEXECUTION_PROHIBITED`で遮断する。これはプロセス内の暫定制御であり、耐久性のある再実行管理はD工程のRun Ledgerへ引き継ぐ。

HTTP分類は次の安全側ルールとした。

- 401/403: `BLOCKED`
- 明示的な`body.ok=false`の業務拒否: `FAIL`（ただし下記不確実応答を除く）
- 408/429および5xx: `UNKNOWN`
- その他の非2xxで明示的業務拒否を確認できない場合: `UNKNOWN`
- 2xxでも応答形式が不正: `UNKNOWN`

HTTPステータスだけを根拠に書込未実施とは判定しない。

## 7. テスト

`node work/verify-story902-e010-business-adapter.cjs`

- 23/23 PASS（既存18件を維持し、レビュー指摘5件を追加）
- 正常Manifest、E010以外、仕様未確定、入力不足
- 正常Mock、Expected一致・不一致、read-after-write不一致
- 業務エラー、認可エラー、通信失敗、タイムアウト
- 不正応答、書込成功後の応答喪失、再読取失敗
- UNKNOWN後の自動再送禁止
- 別Run ID・別request ID・別fixtureでも同一E010の再送禁止
- HTTP 500、408、429のUNKNOWN分類と明示的業務拒否のFAIL分類
- 全結果の`businessExecutionAllowed=false`
- Mock以外のTransport拒否、インフラクライアント不在

関連回帰も次のとおりすべてPASSした。

- B-1 Manifest Loader: 13/13 PASS
- B-2 Continuation Gate: 15/15 PASS
- B-3 Pre-execution / TimeTrip Controller: 25/25 PASS
- 既存全回帰: 225/225 PASS

合計（重複なしの実行単位を単純合算）: 301/301 PASS。

## 8. 未解決事項・次工程への引継ぎ

1. 再送禁止は現在Adapterインスタンス内のRun ID・event ID集合であり、プロセスを跨ぐ耐久性がない。実接続前にD工程の永続Run LedgerとRun provenanceが必要。
2. C-2はB-3実行直前ゲートを業務送信許可へ接続していない。意図的に全経路`businessExecutionAllowed=false`である。
3. `getMemberInfo`はadmin向け集計契約である。実Adapterでは認証主体と既存データ混在の影響を実行直前に確認する必要がある。
4. 実レスポンス喪失時はread-after-writeを自動実施せずUNKNOWNで停止する設計とした。UNKNOWN復旧方針は耐久Ledger工程で確定する。
5. 47イベントManifestのE010 `payload`とHTTP期待欄は工程A由来の未解決表示を保持している。C-2で確認した契約を再生成元へどう反映するかは別途整理が必要。
6. E020以降は仕様状態を変更せず、Adapter対象へ昇格していない。

