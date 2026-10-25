# STORY-902 D-2 Run Ledger純粋モデル・Mock Repository

作成日: 2026-10-25

基準: `main` / `7f0e38e`

範囲: 純粋モデルとメモリ内Mock Repositoryのみ。Firestore、業務API、TimeTripへの接続・変更は未実施。

## 1. 実装結果

D-1契約に基づき、Event Claim識別、状態遷移、原子的予約を模擬するRepository、証跡provenance検証を実装した。B-1/B-2/B-3/C-2の公開契約、既存API・DAO・DTOは変更していない。

すべてのLedger recordと投影結果は`businessExecutionAllowed=false`である。D-2のPASSはMock検証結果であり、実DEVの実行結果ではない。

## 2. 追加ファイル

| ファイル | 内容 |
|---|---|
| `work/story902-run-ledger-model.cjs` | canonical fingerprint、安定Event Claim key、状態モデル、UNKNOWN変換、TimeTrip別状態、provenance検証 |
| `work/story902-run-ledger-mock-repository.cjs` | 不可分な予約、version付き条件更新、競合・中断回復を模擬するメモリRepository |
| `work/verify-story902-run-ledger.cjs` | 予約・競合・状態遷移・証跡分離の18テスト |
| `docs/current-work/STORY-902-D2-run-ledger-mock-20261025.md` | 本記録 |

## 3. Event Claim識別方式

安定キーは次のcanonical objectをSHA-256化する。

```text
projectId = dojo-management-dev
target = dev-firebase
storyId = STORY-902
executionScopeId = 明示必須
eventId = 902-E010等
```

Run ID、request ID、session ID、fixture fingerprintはkeyに含めない。このため、同一scope/eventに別Run IDや別request IDを与えても同じclaimへ衝突する。fixture/Manifest/event fingerprintを変更した予約は、新規イベント扱いにせず`EVENT_CLAIM_FINGERPRINT_CONFLICT`で停止する。

`executionScopeId`は暗黙値や自動採番を行わず、欠落時は`EXECUTION_SCOPE_ID_REQUIRED`で拒否する。

## 4. 状態遷移

```text
不存在（NOT_STARTED）
  -> RESERVED
  -> SEND_INTENT_RECORDED
  -> IN_FLIGHT
  -> PASS | FAIL | BLOCKED | UNKNOWN
```

- 通常finishは`IN_FLIGHT`からterminal stateへの遷移だけを許す。
- `SEND_INTENT_RECORDED`または`IN_FLIGHT`で中断を検出すると、専用復旧経路で`UNKNOWN / PROCESS_INTERRUPTED`へ移す。
- `RESERVED`中断は未実行へ戻さず、`RESERVED + recoveryRequired=true`としてclaimを保持する。安全側に別Runの予約も遮断する。
- terminal stateは不変で、PASS/FAIL/BLOCKED/UNKNOWNの上書きを拒否する。
- UNKNOWNをNOT_STARTEDへ戻す処理、自動再送、claim削除は実装していない。
- request/session/payload/expected fingerprintは`SEND_INTENT_RECORDED`で固定する。

更新はversion一致を要求し、古いsnapshotからの状態更新を`EVENT_CLAIM_VERSION_CONFLICT`で拒否する。

## 5. Mock Repositoryの排他

`reserve()`は事前存在確認と書込みを外部へ分離せず、Repository内部の直列化queue内で不可分に処理する。3 Runnerの同時予約テストでは1件だけ成功し、2件はclaim競合となった。

これはFirestore transactionの意味を模擬するものであり、実Firestoreの実装・接続ではない。D-3以降で実Repositoryを追加する場合も、claim read/createとRun/Event作成を単一transactionで行う必要がある。

## 6. 証跡とB-2投影

Ledger recordは次を保持する。

- Run ID、Event ID、安定Event Claim key
- Manifest / fixture / event / payload / expected fingerprints
- project、target、story、executionScopeId
- request ID、session ID
- Event結果、UNKNOWN理由、read-after-write状態
- evidence kind
- Event状態とは独立したTimeTrip状態

`projectContinuationResult()`はRun ID、Event ID、Manifest/fixture fingerprints、project/targetを再照合する。`MOCK_ONLY`は`MOCK_EVIDENCE_NOT_EXECUTABLE`として拒否し、実DEVのB-2結果へ昇格できない。`DEV_LIVE`であってもprovenance不一致は拒否する。

D-2では投影結果も`businessExecutionAllowed=false`である。

## 7. TimeTrip状態の独立性

TimeTrip状態はEvent resultとは別フィールドで管理する。

```text
NOT_STARTED | BASELINE_CAPTURED | SET_VERIFIED |
RESTORED | RESTORE_FAILED | RECOVERY_REQUIRED
```

例としてEvent=`FAIL`の後にTimeTrip=`RESTORE_FAILED`を記録しても、Event結果は`FAIL`のまま変化しない。TimeTrip evidence digestは任意のSHA-256として検証する。

## 8. テスト結果

`node work/verify-story902-run-ledger.cjs`

- D-2: 18/18 PASS
- 正常予約、同一/別Run、request変更、fixture変更
- 同時3 Runnerで成功1件
- executionScope必須、不正状態遷移
- SEND_INTENT/IN_FLIGHT中断のUNKNOWN化
- RESERVED中断の保持
- UNKNOWN再送禁止、PASS/FAIL不変
- Mock証跡拒否、DEV provenance照合
- TimeTripとEvent結果の独立
- 全経路`businessExecutionAllowed=false`
- sourceにFirebase/HTTPクライアントなし

関連回帰もすべてPASSした。

- B-1 Manifest Loader: 13/13 PASS
- B-2 Continuation Gate: 15/15 PASS
- B-3 Pre-execution / TimeTrip Controller: 25/25 PASS
- C-2 E010 Business Adapter: 23/23 PASS
- 既存全回帰: 225/225 PASS
- 合計: 319/319 PASS

## 9. 安全確認

- Firestore、Firebase、業務APIへ接続していない。
- TimeTripを変更していない。
- 既存業務データを更新していない。
- 新しい業務API・DAO・DTOを追加していない。
- TASK-DEV-024には着手していない。
- stage、commit、push、deployは実施していない。

## 10. 未解決事項・次工程

1. `executionScopeId`の発行・終了・再試験規則はD-1から継続して未確定。
2. D-2 Repositoryはプロセス内メモリだけで、再起動耐久性はない。実Firestore repositoryは後工程。
3. 実Ledger collection名、Security Rules、信頼された書込主体は未決定。
4. Run document、Event document、claimを実transactionで同時作成する実装は未着手。
5. UNKNOWNのread-after-write調査・手動resolutionは未実装。
6. TimeTrip baseline/restoreの耐久記録とenvironment lockは未実装。
7. B-2へ実結果を渡す正式なprovenance validator接続は未実装。
8. C-2 Business Adapterへの送信能力付与は行っておらず、実行許可は引き続きfalse。
