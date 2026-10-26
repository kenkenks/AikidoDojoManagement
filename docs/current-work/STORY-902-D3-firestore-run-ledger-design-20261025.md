# STORY-902 D-3 Firestore Run Ledger Repository設計

作成日: 2026-10-25

基準: `main` / `35bcb5a`

範囲: D-1契約とD-2純粋モデルを基準にした調査・設計のみ。実装、実通信、Firestore書込み、TimeTrip変更は実施していない。

## 1. 結論

Firestore Run Ledger Repositoryは、STORY-902の信頼されたDEV RunnerとFirestore Admin SDKの間に置く専用データアクセス境界とする。業務WebConnect、既存の業務DAO/DTO、ブラウザからは直接操作させない。D-2の純粋モデルを状態検証と状態遷移の唯一の実装として再利用し、Repositoryは参照生成、Firestore transaction、version付き条件更新、永続化形式の変換だけを担当する。

同一Event Claimの一意性は、`projectId / target / storyId / executionScopeId / eventId`の5要素をD-2と同じcanonical化・SHA-256で導出したdocument IDによって保証する。Run ID、request ID、fixture fingerprintを変更してもdocument IDは変わらない。Run、Event、Claimの作成は1回のFirestore transactionで行い、Claimが存在する場合は再予約しない。

本工程では`businessExecutionAllowed=false`を維持する。Firestore書込みと業務API送信は別transactionであり、Ledgerの書込結果が不明な場合や`SEND_INTENT_RECORDED`以降で中断した場合は安全側に停止し、自動再送しない。

## 2. 調査結果と現行アーキテクチャとの接続位置

### 2.1 確認した既存資産

| 資産 | D-3で利用する契約 |
|---|---|
| `docs/Architecture/ARCH-009_データアクセスアーキテクチャ` | 業務語彙・論理キーと物理保存処理を分離し、Target/Compositionで実装を注入する。Firestore transactionは明示的な能力契約として扱う。 |
| `cloud/api/dojo-account-transaction.cjs` | Admin SDKの`runTransaction`をRepository境界へ閉じ込め、全readをwriteより前に行い、`transaction.create`で競合を拒否する既存例。 |
| `cloud/api/dojo-account-lifecycle.cjs` | 純粋な状態・policy層へatomic repositoryを注入する既存例。 |
| `cloud/api/server.cjs` | `getFirestore(firebaseApp)`と`FieldValue.serverTimestamp()`をcomposition rootから各Firestore adapterへ注入する既存例。 |
| `shared/DAO_Business.js` / `shared/DAO_Definitions.js` | 既存業務データの共通契約。Run Ledgerは業務データではないため変更・混在させない。 |
| D-1設計 | Ledger構造、安定Claim、UNKNOWN、TimeTrip分離、証跡種別の基準。 |
| D-2純粋モデル / Mock Repository | 5要素のClaim key、入力検証、状態遷移、version競合、Mock/DEV証跡分離の基準。 |

### 2.2 推奨接続

```text
STORY-902 trusted DEV Runner
  -> Run Ledger application service
    -> D-2 pure model
    -> injected RunLedgerRepository port
      -> Firestore RunLedgerRepository adapter
        -> Firebase Admin SDK / dojo-management-dev
```

- Repositoryは業務Eventを実行しない。業務WebConnect Adapterとは別の依存である。
- D-3で新しいHTTP/API endpointを追加しない。ブラウザへAdmin SDK資格情報やLedger書込権限を渡さない。
- 実装時はSDKインスタンスとserver timestamp生成をcomposition rootから注入し、module import時に接続しない。
- DEV固定条件は純粋モデルとRepositoryの両方で再検証する。`projectId=dojo-management-dev`、`target=dev-firebase`以外を拒否する。
- ARCH-009に従い、物理collection名、transaction、serializationはRepository内へ閉じ込める。既存業務DAO/DTOは変更しない。

## 3. Firestoreコレクション／ドキュメント構造

D-1の論理構造を維持する。collection名は実装承認時にschema台帳と運用ルールへの登録要否を再確認する。

```text
story902_runs/{runId}
story902_runs/{runId}/events/{eventId}
story902_event_claims/{stableEventKey}
story902_environment_locks/{projectId_target}
```

### 3.1 Claim document

再実行防止の権威とする。document IDはD-2の`stableEventKey()`をそのまま使用する。

```json
{
  "schemaVersion": 1,
  "stableEventKey": "sha256",
  "projectId": "dojo-management-dev",
  "target": "dev-firebase",
  "storyId": "STORY-902",
  "executionScopeId": "explicit-scope",
  "eventId": "902-E010",
  "ownerRunId": "...",
  "manifestFingerprint": "sha256",
  "fixtureFingerprint": "sha256",
  "eventFingerprint": "sha256",
  "state": "RESERVED|SEND_INTENT_RECORDED|IN_FLIGHT|TERMINAL|UNKNOWN",
  "version": 1,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

Run ID、request ID、session ID、fixture fingerprintはdocument IDに含めない。既存Claimとfingerprintが異なる場合も新規Claimとして作らず、`EVENT_CLAIM_FINGERPRINT_CONFLICT`とする。Claimは通常cleanupで削除しない。

### 3.2 Run document

Run全体のprovenance、進行状態、TimeTrip lifecycle、環境lock所有を管理する。Run IDはセッション識別であり、再送防止キーではない。認証トークン、Authorization header、レスポンス全文、不要な個人情報を保存しない。

### 3.3 Event document

D-2 recordを永続化する。camelCaseのモデルとFirestore保存形式の相互変換はRepository内で固定し、読取時に`assertRecord()`を通す。`requestId`、`sessionId`、各fingerprint、結果、UNKNOWN理由、read-after-write、証跡種別、TimeTrip状態、version、各server timestampを保持する。

Event結果とTimeTrip復元状態は別フィールドとして更新する。EventがPASS/FAIL/BLOCKED/UNKNOWNになった後もTimeTripをRESTORED/RESTORE_FAILEDへ更新できるが、Event結果は変更しない。

### 3.4 Environment lock

`dojo-management-dev_dev-firebase`を固定document IDとし、TimeTripがDEV全体共有であることを表す。D-3 Repository実装の最小範囲では読取・予約契約までを設計し、lock取得・復旧の実装はTimeTrip耐久統合工程へ分離する。時限切れだけで自動解放しない。

## 4. Claim取得transaction

### 4.1 入力

Repositoryの`reserve(input)`はD-2 `validateIdentity()`が受け付ける値に加え、Run metadataと証跡種別を受け取る。`executionScopeId`は明示必須で、自動採番しない。Firestore実Repositoryでは`evidenceKind=DEV_LIVE`だけを受け付け、`MOCK_ONLY`をlive collectionへ保存しない。

### 4.2 原子的予約手順

1. transaction開始前にRun ID、5要素、全fingerprint、DEV固定条件を純粋モデルで検証する。
2. transaction内でRun、Event、Claim、必要ならEnvironment lockをすべて読む。
3. 書込み前に、Claim不存在、Event不存在、Runのenvironment/scope/fingerprint整合、lock競合なしを検証する。
4. D-2 `createReservedRecord()`でEventを作る。
5. `transaction.create()`でClaimとEventを作る。Run不存在時だけRunもcreateし、既存Runなら整合確認後に条件付き更新する。
6. transaction commit後、ClaimとEventをread-onlyで再取得し、key、owner、fingerprint、state、versionを照合する。
7. 読戻し一致時だけ予約成功を返す。不一致・読取不能・commit結果不明は`REPOSITORY_OUTCOME_UNKNOWN`とし、業務送信を禁止する。

Firestore transaction callbackは競合時に再実行され得るため、callback内で外部通信、業務送信、ログファイル作成、乱数・時刻によるID採番を行わない。Run ID、timestamp以外の入力、fingerprintはcallback前に確定する。全readをwriteより前に行う。

## 5. 状態遷移と更新条件

Repository portはMock Repositoryと同等の操作を提供する。

```text
reserve
get
recordSendIntent
markInFlight
finish
recoverInterrupted
setTimeTripState
```

各更新はtransactionでEventとClaimを読み、次を検証する。

- stable key、owner Run、project/target/story/scope/eventが一致する。
- Manifest/fixture/event fingerprintが一致する。
- EventとClaimのstate/versionが矛盾しない。
- 呼出側のexpectedVersionが現在versionと一致する。
- D-2 `transition()`、`markInterrupted()`、`updateTimeTrip()`が遷移を許可する。

検証後、EventとClaimを同一transactionで更新する。Event stateがterminalならClaim stateは`TERMINAL`または`UNKNOWN`とし、PASS/FAIL/BLOCKED/UNKNOWNを通常経路で上書きしない。TimeTripだけの更新ではClaim/Event結果を変えず、Event documentの`timeTrip`とversionだけを条件付き更新する。

## 6. 競合・再実行・中断時の扱い

| 状況 | Repositoryの扱い |
|---|---|
| 同時Runnerが同一Claimを予約 | `transaction.create`の成功は1件だけ。敗者は既存Claimを再読し、`EVENT_CLAIM_ALREADY_EXISTS`またはfingerprint conflict。 |
| 同一Run IDの再予約 | 既存Event/Claimを返して診断可能にするが、予約成功や送信許可にはしない。 |
| 別Run ID | 5要素が同じため同じClaimへ衝突し、拒否する。 |
| request ID変更 | keyに影響しないため拒否する。 |
| fixture変更 | keyに影響せず、fingerprint conflictとして拒否する。 |
| RESERVEDで中断 | Claimを保持し、`recoveryRequired=true`。NOT_STARTEDへ戻さず別Runも拒否する。 |
| SEND_INTENT_RECORDEDで中断 | 再起動時にtransactionでUNKNOWNへ遷移し、自動再送しない。 |
| IN_FLIGHTで中断 | 同上。業務commit有無を推測しない。 |
| terminal result | 不変。手動resolutionは将来の追記documentで扱い、元状態を上書きしない。 |

同じClaimを別executionScopeIdに変えれば別keyになるため、executionScopeIdの発行は再試験を許可する管理操作に相当する。通常Runnerが自動生成・変更してはならない。

## 7. Firestore通信失敗・再試行の安全性

### 7.1 SDK transaction再試行

Firestore SDKの競合再試行は、同じ決定的transaction callbackに限って利用する。Repository独自の無制限再試行は実装しない。競合上限、deadline、unavailable等はreason codeへ正規化する。

### 7.2 reserveの応答喪失

commit結果が不明でも別keyを作らない。stable keyをread-onlyで再取得する。

- 完全一致Claim/Eventが存在: 新規予約は行わず、既存予約として返し、後続はrecovery判断へ送る。
- 不存在を確認: 同じ入力・同じkeyによる予約の再試行は技術上二重作成されないが、遅延可視性と実行主体の競合を考慮し、D-3では自動再試行せず`REPOSITORY_OUTCOME_UNKNOWN`で停止する。
- 一部存在、不一致、読取不能: `REPOSITORY_INCONSISTENT`で停止し、自動修復・削除しない。

### 7.3 状態更新の応答喪失

同じEvent/Claimをread-onlyで再取得し、expected state、version、fingerprintが完全一致する場合だけ更新済みと確認する。`SEND_INTENT_RECORDED`または`IN_FLIGHT`の結果が不明な場合、未実行へ戻さない。特にsend intentの耐久保存と読戻しが確認できる前に業務Transportを呼ばない。

### 7.4 業務応答後のLedger更新失敗

業務結果とLedger書込みは原子的にできない。PASS/FAIL保存が確認できなければEventを自動再実行せず、UNKNOWN/recovery requiredとして扱う。read-after-writeと手動resolutionはD-1方針どおり追記型証跡にする。

## 8. Mock Repositoryとの契約互換性

- 公開操作名、入力identity、expectedVersion、戻りrecord、error codeの意味をD-2 Mock Repositoryに合わせる。
- 状態遷移はD-2純粋モデルだけを呼び、Firestore adapter内に別の状態機械を作らない。
- Mockは`MOCK_ONLY`、Firestore live repositoryは`DEV_LIVE`を要求する。Mock recordをFirestoreへimportしてPASSへ昇格させない。
- D-2 `projectContinuationResult()`のprovenance検証を維持し、Run ID、Event ID、fingerprints、project、target、evidence kindの一致なしにB-2へPASSを渡さない。
- Firestore固有timestamp/reference/snapshotをportの戻り値へ漏らさず、JSON互換recordへ正規化する。

## 9. テスト計画

### 9.1 Repository contract test

同じテストベクトルをMockとFirestore adapter doubleへ適用する。

1. 5要素から同じstable keyを生成する。
2. 正常予約とreadback。
3. 同一/別Run、request変更、fixture変更の再予約拒否。
4. 20件以上の同時予約で成功1件。
5. version競合と不正状態遷移。
6. RESERVED中断保持。
7. SEND_INTENT/IN_FLIGHT中断のUNKNOWN化。
8. terminal不変性。
9. Event結果とTimeTrip状態の独立更新。
10. MOCK_ONLYのlive保存拒否。
11. transaction callback再試行時にも外部副作用がない。
12. commit成功・応答喪失、readback一致/不一致/不能。
13. Eventだけ、Claimだけが存在する不整合の停止。
14. DEV以外のproject/target拒否。
15. 全戻り値で`businessExecutionAllowed=false`。

### 9.2 Firestore Emulator

設計承認後にEmulator専用projectでtransaction競合、create衝突、server timestamp、再起動後読取を検証する。`FIRESTORE_EMULATOR_HOST`の明示を必須にし、`dojo-management-dev`実接続との同時設定を拒否する。Admin SDKはSecurity Rulesを迂回するため、Emulator成功だけでIAM/実行主体の安全性を証明したことにしない。

### 9.3 静的安全確認

- RepositoryにHTTP/WebConnect/Business Adapter呼出しがない。
- module loadでFirebase初期化しない。
- D-2以外の状態遷移実装がない。
- token、Authorization、会員個人情報を保存しない。
- 実装テスト中は実Firestore、TimeTrip、業務APIを呼ばない。

## 10. D-3実装範囲案

設計承認後も、最初の実装は接続しないRepository adapterとtransaction doubleまでに限定する。

1. `work/story902-run-ledger-firestore-repository.cjs`: 注入されたFirestore-like portを使うRepository。実SDKを直接初期化しない。
2. `work/verify-story902-run-ledger-firestore-repository.cjs`: transaction doubleによる競合・障害・契約テスト。
3. D-2純粋モデルとのcontract test共通化。
4. collection path、serialization、server timestamp注入、エラー正規化。
5. DEV固定、DEV_LIVE限定、`businessExecutionAllowed=false`。

実Admin SDK composition、実Firestore接続、Environment lock、TimeTrip耐久統合、Business Adapter送信能力、UNKNOWN手動resolution、UIは別承認・別工程とする。新しいAPI endpointは作成しない。

## 11. 未解決事項とリスク

優先度順:

1. `executionScopeId`の発行、終了、再試験承認の正式ルール。変更は新しいClaimを作れる強い操作である。
2. collection名とschema台帳への登録、保存期間、index、バックアップ、削除禁止期間。
3. 信頼されたDEV Runnerの実行場所とAdmin SDK認証主体、最小IAM権限。Admin SDKはSecurity Rulesを迂回する。
4. 実SDK compositionを`work/`のローカルRunnerに置くか、既存Cloud compositionへ置くか。新endpointを追加しない前提で確定が必要。
5. Run/Event/Claimの部分存在が既にある場合の手動復旧手順。自動修復・自動削除は禁止する。
6. Firestore transactionと業務transactionを原子的にできないため、UNKNOWNの機械的帰属は既存read契約だけでは確定できない。
7. Environment lockとTimeTrip baseline/restoreの耐久Repositoryは未実装。restore failure時のlock自動解放は禁止する。
8. 手動resolutionの承認者、policy version、B-2へPASSを渡せる条件。
9. server timestampの読戻し確定前のpending値、時計・deadline、Firestore database IDの扱い。
10. 実Firestore障害時の運用手順と監視。安全側停止が47件連続Runner全体へ与える影響を定義する必要がある。

## 12. 安全確認

- D-1契約とD-2公開契約を変更していない。
- 既存業務API、DAO、DTO、ARCH-009の業務経路を変更していない。
- 新しいAPI endpointを設計していない。
- Firestore、Firebase、業務APIへ接続・書込みしていない。
- TimeTripを変更していない。
- D-3実装、stage、commit、push、deployは実施していない。
- `businessExecutionAllowed=false`を維持している。
