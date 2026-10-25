# STORY-902 D-3a Firestore Run Ledger Repository オフライン実装

作成日: 2026-10-25

基準: `main` / `35bcb5a`

範囲: 注入型Firestore Repository、Transaction Fake、オフライン検証。実Firestore、業務API、TimeTripには接続していない。

## 1. 結論

D-1契約、D-2純粋モデル、D-3設計、ARCH-009の間に実装を止める矛盾はなかった。D-2の状態モデルを変更せず、Firestore物理境界だけを担うRepositoryと、競合・transaction再試行・commit応答喪失を再現するFake Adapterを実装した。

ClaimはD-2と同じ5要素から導出されるため、Run ID、request ID、fixture fingerprintを変えても同じClaimへ衝突する。同時3 Runnerでは予約成功1件、競合2件となった。すべての永続recordは`businessExecutionAllowed=false`である。

## 2. 実装ファイル

| ファイル | 内容 |
|---|---|
| `work/story902-run-ledger-firestore-repository.cjs` | 注入Firestore clientを使用するRun Ledger Repository |
| `work/story902-firestore-transaction-fake.cjs` | optimistic transaction、競合再試行、commit前失敗・commit応答喪失を模擬するFake |
| `work/verify-story902-firestore-run-ledger.cjs` | D-3aの20テスト |
| `docs/current-work/STORY-902-D3a-firestore-repository-offline-20261025.md` | 本記録 |

D-2文書は変更していない。作業開始時点の`git diff`でも当該文書の差分は表示されなかったため、指示された「1行の未コミット差分」に対する修正・復元は行っていない。

## 3. Repositoryインターフェース

```text
reserve(input)
get(stableEventKey)
recordSendIntent(stableEventKey, expectedVersion, input)
markInFlight(stableEventKey, expectedVersion)
finish(stableEventKey, expectedVersion, input)
recoverInterrupted(stableEventKey, expectedVersion)
setTimeTripState(stableEventKey, expectedVersion, state, evidenceDigest)
```

- D-2 Mock Repositoryの操作名と状態モデルを維持した。
- `createReservedRecord`、`transition`、`markInterrupted`、`updateTimeTrip`、`assertRecord`を再利用し、Firestore adapter内に別の状態機械を実装していない。
- Repositoryは`collection()`と`runTransaction()`を備えたFirestore clientを依存注入で受け取る。Firebase Admin SDKをimport・初期化しない。
- 実Repository境界は`DEV_LIVE`だけを受け付け、`MOCK_ONLY`をlive collectionへ保存しない。
- project、target、storyは`dojo-management-dev / dev-firebase / STORY-902`に固定した。

## 4. Transaction処理

### 4.1 Claim予約

1. D-2純粋モデルで入力、executionScopeId、fingerprint、安定Claim keyを検証する。
2. transactionでClaim、Event、Runをすべて読む。
3. Claim/Event不存在とRun整合を確認する。
4. RunがなければRunを作成する。
5. Event=`RESERVED`とClaim=`RESERVED`を`create`する。
6. commit後にClaim/Eventを読み戻し、owner、state、version、keyを照合する。

Claim document IDは次の5要素のcanonical SHA-256である。

```text
projectId / target / storyId / executionScopeId / eventId
```

Run ID、request ID、fixture fingerprintはkeyに含めない。fixtureの差は別Claimではなくfingerprint conflictとなる。

### 4.2 条件付き更新

各更新transactionでClaimとEventを読み、owner、state、version、fingerprint整合を検証する。`expectedVersion`不一致は更新しない。D-2純粋モデルが返した次状態をEventへ保存し、Claimのstate/versionも同一transactionで同期する。

PASS/FAIL/BLOCKED/UNKNOWNはD-2のterminal不変性によって上書きできない。TimeTrip更新はEvent結果を変えず、terminal result後も独立してRESTORED等へ更新できる。

### 4.3 中断・不明結果

- RESERVED中断: Claimを保持し、`recoveryRequired=true`。再予約不可。
- SEND_INTENT_RECORDED / IN_FLIGHT中断: `UNKNOWN / PROCESS_INTERRUPTED`へ移し、自動再送不可。
- transaction commit前失敗: recordを作らず例外で停止。
- commit応答喪失: stable keyで読戻しても成功扱いせず`REPOSITORY_OUTCOME_UNKNOWN`。Claimは残るため別Runの再予約を防止する。
- 部分存在やEvent/Claim不整合: `REPOSITORY_INCONSISTENT`で停止し、自動修復・削除をしない。

## 5. Fake Adapterの競合再現

Fakeはdocumentごとのrevisionと、commit専用queueを持つoptimistic transactionである。

1. 各transaction callbackは読取時のrevisionを記録する。
2. 複数callbackは同じ不存在状態を並行して読める。
3. commit queueで最初のtransactionだけがcreateを確定する。
4. 後続transactionはrevision conflictを検出し、callbackを再実行する。
5. 再実行後は既存Claimを読み、Repositoryが競合として拒否する。

Fakeが模擬する障害:

- commit前の明示的transaction失敗
- optimistic conflictとcallback再実行
- 書込みcommit後の応答喪失
- create済みdocumentへの競合

transaction callback内には外部通信、Event送信、Fake外部副作用がない。競合テストではcallback実行回数がtransaction要求数を超える一方、外部副作用数は0だった。

## 6. D-2との契約互換性

- 安定Claim keyの5要素、validation、fingerprint実装をそのまま再利用した。
- 状態遷移とterminal不変性はD-2純粋モデルが唯一の判定元である。
- Mock/DEV証跡分離と`projectContinuationResult()`のprovenance検証を維持した。
- Mock Repository同様、操作結果はJSON互換recordで、Firestore snapshot/referenceを公開しない。
- `businessExecutionAllowed=false`を全record・投影で維持した。

差異は物理排他方式だけである。D-2 Mockはプロセス内queue、D-3a Repositoryは注入Firestore transaction、Fakeはrevision競合再試行を使用する。

## 7. テスト結果

### D-3a

`node work/verify-story902-firestore-run-ledger.cjs`

- 20/20 PASS
- 初回予約、同一/別Run、request変更、fixture変更
- 同時3 Runnerで成功1件・競合2件
- RESERVED保持、SEND_INTENT/IN_FLIGHTのUNKNOWN化
- PASS/FAIL/BLOCKED/UNKNOWN不変
- Event結果とTimeTrip状態の独立
- Mock証跡拒否、DEV provenance維持
- transaction失敗の安全停止
- retry callbackに外部副作用なし
- commit応答喪失後の重複Claim防止

### 回帰

- D-2 Run Ledger: 18/18 PASS
- B-1 Manifest Loader: 13/13 PASS
- B-2 Continuation Gate: 15/15 PASS
- B-3 Pre-execution / TimeTrip: 25/25 PASS
- C-2 Business Adapter: 23/23 PASS
- 既存回帰: 225/225 PASS
- B-1〜C-2＋既存回帰: 301/301 PASS
- 構文チェック: 3/3 PASS

実Firestore、Firebase SDK、WebConnect、TimeTripを使用するテストは実行していない。

## 8. D-3bへの引継ぎ

1. Firestore Emulator専用compositionを追加し、Admin SDKの実transaction semanticsを検証する。
2. Emulator接続時は`FIRESTORE_EMULATOR_HOST`を必須とし、実DEV credentialとの混在を拒否する。
3. server timestampのpending/確定値とreadback正規化を確認する。
4. 同時processによるClaim競合、SDK transaction retry上限、deadline/unavailableを検証する。
5. Run/Event/Claimのcollection名とschema台帳登録を承認する。
6. 実DEVへ進む前に、実行主体、IAM、保存期間、environment lockを確定する。
7. Business AdapterやTimeTrip Controllerへの送信能力付与は別工程とする。

## 9. 残課題・リスク

1. FakeはFirestore SDKそのものではない。transaction retry、server timestamp、ネットワーク障害の細部はEmulator検証が必要。
2. `executionScopeId`の発行・終了・再試験承認ルールが未確定。
3. 実Admin SDK compositionと最小IAM権限が未確定。Admin SDKはSecurity Rulesを迂回する。
4. Environment lock、TimeTrip baseline/restoreの耐久管理は未実装。
5. 業務transactionとLedger transactionは原子的にできず、UNKNOWNの完全自動解決はできない。
6. 部分存在・不整合recordの手動復旧手順と監査責任者が未確定。
7. 実Repositoryでのerror code正規化とbounded retry policyはEmulator結果を基に固定する必要がある。

## 10. 安全確認

- D-1契約、D-2公開契約、既存DAO/DTOを変更していない。
- 新しいAPI endpointを追加していない。
- 実Firestore/Firebaseへ接続・書込みしていない。
- 実Eventを送信していない。
- TimeTripを変更していない。
- 既存の未コミット・未追跡資産を削除・上書きしていない。
- stage、commit、push、deployは実施していない。
