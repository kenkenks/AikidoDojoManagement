# STORY-902 D-1 Run Ledger契約設計

作成日: 2026-10-25

基準: `main` / `c193c81`

範囲: 調査・設計のみ。コード、業務API、DAO、DTO、Firestore、TimeTripは変更していない。

## 1. 結論

Run Ledgerは、47イベントを束ねるRunと、業務上1回だけ送信できるEvent Executionを分離して管理する。Run IDだけでは再送防止キーにしない。`dojo-management-dev / STORY-902 / eventId`を核とする安定イベントキーをFirestore上の排他claimとして予約し、別Run ID、別request ID、別fixture、複数Runnerからの同一イベント再送を遮断する。

業務API呼出し前に`SEND_INTENT_RECORDED`を耐久保存し、読戻し確認する。`SEND_INTENT_RECORDED`または`IN_FLIGHT`のまま停止した実行は、送信前だったと推定できても自動的に`NOT_STARTED`へ戻さず`UNKNOWN`として扱う。UNKNOWNは自動再送しない。

Ledger用Firestore transactionと既存`attendance_batch` transactionは別トランザクションであり、両者を原子的にはできない。この境界を状態遷移、安定claim、read-after-write証跡、手動解決で管理する。

本設計時点では`businessExecutionAllowed=false`を維持する。

## 2. 現行実装の調査結果

### 2.1 STORY-902基盤

| 資産 | 確認結果 |
|---|---|
| `work/story902-manifest-loader.cjs` | 47件Manifest、依存参照、循環、仕様状態をfail-closedで検証する。全ゲートは`businessExecutionAllowed=false`。 |
| `work/story902-continuation-gate.cjs` | `PASS/FAIL/BLOCKED/UNKNOWN`を扱うが、結果にRun ID、fingerprint、環境、証跡種別を持たない。B-2単独の結果を実行許可へ流用できない。 |
| `work/story902-pre-execution-gate.cjs` | DEV、認証、fixture、結果出所、TimeTrip対象を検証する。結果出所はRun ID一致を要求するが、耐久Ledgerによる真正性確認は未実装。 |
| `work/story902-time-trip-controller.cjs` | baseline取得、set、verify、restoreを注入Adapter経由で行う。状態と診断はメモリ内で、プロセス停止後の復元証跡はない。 |
| `work/story902-e010-business-adapter.cjs` | 同一Adapter内でRun IDとE010の再送を遮断するが、プロセスを跨がない。Mock専用で、すべて`businessExecutionAllowed=false`。 |

### 2.2 既存の耐久化・排他方式

- `work/fw001-firestore-safety.cjs`は、Git管理外JSONの排他的作成、`fsync`、atomic rename、ロックファイル、書込前intent、遅延書込可能性、子プロセスreap後のcleanupを実装している。
- `work/fw001-candidate-safety.cjs`は、外部送信前にinput hashとpending状態を耐久保存し、応答喪失をremote outcome uncertainとして停止する。
- 保留ブランチの`work/manage-story902-e010-dev-fixture.cjs`は、fixture apply前の`PREPARED`、commit後の`COMMITTED/FAILED/UNKNOWN`を排他的JSONへ保存する。PREPARED単独をUNKNOWN扱いにし、完全一致照合だけでfixture所有証跡を復旧する。
- これらのローカルJSON方式は単一端末の耐久証跡には再利用できるが、複数Runner間の排他権威にはできない。D-2ではFirestore claimを権威、ローカル不変JSONを補助ミラーとする。

### 2.3 既存業務の冪等性

- 現行`attendance_batch`は`attendance_session_id`を出席行へ保持する。
- C-1/C-2で生成する`request_id`は、現行Attendance Coreの永続request receiptまたは冪等キーとして利用されていない。
- 出席同期自体には同一scope/slotの重複を抑える既存業務ロジックがあるが、これはSTORY-902イベント送信の一意性証明ではない。
- cash/PayPay系には`request_id`をdocument keyとするrequest receipt実装があるが、イベント種別ごとに契約が異なり、E010へ一般化できない。
- `member_attendance_state`は対象scopeの現在slotとplanを確認でき、`getMemberInfo`は月次請求集計を確認できる。ただし、いずれもE010のrequest IDを返さない。

## 3. 用語と識別子

### 3.1 Run ID

47イベントを順次処理する1回のRunnerセッションを識別する。Run IDは進捗、開始・終了、実行主体、TimeTrip lifecycleを束ねるが、イベントの再送防止キーではない。

### 3.2 Event ID

Manifest上の業務イベント（例:`902-E010`）。1 Run内では最大1件のEvent Executionを持つ。

### 3.3 安定イベントキー

推奨論理値:

```text
SHA-256(projectId | target | storyId | executionScopeId | eventId)
```

- `projectId=dojo-management-dev`
- `target=dev-firebase`
- `storyId=STORY-902`
- `executionScopeId`: fixture世代を表す管理者確定値。Run ID、request ID、fixture内容から自動生成しない。
- `eventId=902-E010`等

同じ`executionScopeId`ではRun ID、request ID、fixture fingerprintを変えても同じclaimになる。fixture fingerprintまたはManifest fingerprintが既存claimと異なる場合は新規イベント扱いにせず、`FINGERPRINT_CONFLICT`で停止する。

現在Manifestには正式な`executionScopeId`がない。D-2で勝手に補完せず、fixture世代`STORY902_E010_20261025_APPLY01`との関係を確定する必要がある。

## 4. 推奨Ledger構造

Firestore上の専用テスト基盤collectionを想定する。業務collection、既存DAO、業務APIとは分離する。名称はD-2実装前にschema/命名規則を確認する。

```text
story902_runs/{runId}
story902_runs/{runId}/events/{eventId}
story902_event_claims/{stableEventKey}
story902_environment_locks/{projectId_target}
```

### 4.1 Run document

```json
{
  "schema_version": 1,
  "story_id": "STORY-902",
  "run_id": "...",
  "project_id": "dojo-management-dev",
  "target": "dev-firebase",
  "execution_scope_id": "...",
  "manifest_fingerprint": "sha256",
  "fixture_fingerprint": "sha256",
  "state": "ACTIVE|STOPPED|COMPLETED|RECOVERY_REQUIRED",
  "created_at": "server timestamp",
  "started_at": "server timestamp|null",
  "finished_at": "server timestamp|null",
  "created_by_uid_hash": "non-reversible identifier",
  "business_execution_allowed": false
}
```

認証トークン、Authorization header、個人情報を保存しない。UIDを必要とする場合は監査用の非可逆識別子または既存の安全なprincipal ID契約に従う。

### 4.2 Event Execution document

```json
{
  "schema_version": 1,
  "run_id": "...",
  "event_id": "902-E010",
  "stable_event_key": "sha256",
  "manifest_fingerprint": "sha256",
  "event_fingerprint": "sha256",
  "fixture_fingerprint": "sha256",
  "payload_fingerprint": "sha256",
  "expected_fingerprint": "sha256",
  "project_id": "dojo-management-dev",
  "target": "dev-firebase",
  "state": "RESERVED|SEND_INTENT_RECORDED|IN_FLIGHT|PASS|FAIL|BLOCKED|UNKNOWN",
  "request_id": "...",
  "attendance_session_id": "...",
  "reserved_at": "server timestamp",
  "send_intent_recorded_at": "server timestamp|null",
  "in_flight_at": "server timestamp|null",
  "finished_at": "server timestamp|null",
  "result": {"status": "...", "http_status": null, "reason_code": null},
  "unknown_reason": null,
  "read_after_write": {"status": "NOT_RUN|PASS|FAIL|INCONCLUSIVE", "evidence_digest": null},
  "evidence_kind": "DEV_LIVE|MOCK_ONLY",
  "time_trip": {"expected_digest": "...", "verified": false},
  "business_execution_allowed": false,
  "version": 1
}
```

レスポンス本文や会員情報を無制限に保存せず、必要最小限の正規化結果、reason code、SHA-256 digest、取得日時を保存する。秘密情報は保存しない。

### 4.3 Event claim document

```json
{
  "stable_event_key": "...",
  "story_id": "STORY-902",
  "execution_scope_id": "...",
  "event_id": "902-E010",
  "owner_run_id": "...",
  "manifest_fingerprint": "...",
  "fixture_fingerprint": "...",
  "state": "RESERVED|SEND_INTENT_RECORDED|IN_FLIGHT|TERMINAL|UNKNOWN",
  "created_at": "server timestamp",
  "updated_at": "server timestamp"
}
```

claimは再送防止の権威であり、通常Runnerやcleanupで削除しない。過去Runのclaimを解除して再実行する操作は、自動復旧や通常UIに含めない。

## 5. Fingerprint契約

- Canonical JSONはキーを辞書順に並べ、UTF-8、数値表現を固定し、未定義値を拒否する。
- Manifest fingerprint: 実行に使用したManifest全体。生成日時など非意味項目を含めるかD-2で固定する。
- Event fingerprint: 当該eventの確定定義。
- Fixture fingerprint: 実際のfixture ID、参照関係、業務条件。秘密値は含めない。
- Payload fingerprint: WebConnectへ送るaction/method/inputの完全なcanonical value。
- Expected fingerprint: Judgeに使用するExpected。

既存claimとfingerprintが異なる場合は再送許可にせず停止する。変更後の再試験には、管理者が別の`executionScopeId`を明示的に発行する手続きが必要である。

## 6. 状態遷移

```text
NOT_STARTED（document不存在）
    │ reserve transaction
    ▼
RESERVED
    │ intentを耐久保存・読戻し確認
    ▼
SEND_INTENT_RECORDED
    │ 送信直前状態を耐久保存
    ▼
IN_FLIGHT
    ├── PASS
    ├── FAIL
    ├── BLOCKED
    └── UNKNOWN
```

規則:

1. `RESERVED`は送信前preflight完了を意味するが、送信許可ではない。
2. `SEND_INTENT_RECORDED`にはrequest/session/payload fingerprintsを確定して保存する。保存commitと読戻しが完了する前にTransportを呼ばない。
3. `IN_FLIGHT`を保存してから、同じ不変payloadを1回だけ送信する。
4. 応答喪失、timeout、408/429/5xx、不正応答、read-after-write不能は`UNKNOWN`。
5. `SEND_INTENT_RECORDED`または`IN_FLIGHT`が残る再起動は、実際にHTTP送信した証拠がなくても`UNKNOWN`へ遷移させ、再送しない。
6. `PASS/FAIL/BLOCKED/UNKNOWN`は通常Runnerから変更不可。UNKNOWN解決は追記型resolutionとして保存し、元状態と証拠を残す。
7. `businessExecutionAllowed`はD-1/D-2では常にfalse。将来の送信直前ゲートだけが、Ledger予約、TimeTrip、認証、fixtureの全条件をその瞬間に再検証して一時的な送信能力を発行する。

## 7. 排他・二重実行防止

### 7.1 原子的予約

Firestore transactionで次を同時に行う。

1. Run documentとEvent documentを読む。
2. 安定イベントclaimを読む。
3. environment lockを読む。
4. claim不存在、Event未実行、fingerprint一致、DEV target一致を確認する。
5. Event=`RESERVED`とclaim=`RESERVED`を`create`する。

claimが存在すれば、所有Runが同じでも異なっても自動送信しない。同じRunの再開はLedgerを読むだけで、業務送信へ戻らない。

### 7.2 ケース別挙動

| ケース | 判定 |
|---|---|
| 同一Run ID再実行 | 既存Eventを返し、送信禁止 |
| 別Run ID・同一event | 安定claim衝突で禁止 |
| request_id変更 | claimはrequest ID非依存なので禁止 |
| fixture変更 | claim衝突＋fingerprint conflictで禁止 |
| 複数Runner | claimのtransaction create競合により1件だけ予約 |
| API送信直後停止 | Event/claimはIN_FLIGHT。再起動時UNKNOWN、再送禁止 |
| 業務commit後の応答喪失 | UNKNOWN。read-after-write調査へ |
| Ledger intent保存失敗 | APIを呼ばない。RESERVEDのまま停止し、手動診断 |
| read-after-write失敗 | UNKNOWN。PASSへ推測変換しない |

Firestore transactionは予約の排他にのみ使い、既存業務transactionへLedger書込みを混在させない。

## 8. UNKNOWN復旧方針

UNKNOWNは自動再送しない。復旧はread-onlyかつ追記型とする。

1. Ledger、claim、fingerprints、request/session IDs、TimeTrip証跡を読取る。
2. 既存`member_attendance_state`で対象日・道場・課金枠・slot・planを確認する。
3. 既存`getMemberInfo`で対象月の請求集計を確認する。
4. 結果を`MATCH / MISMATCH / INCONCLUSIVE / READ_FAILED`としてresolution recordへ追記する。
5. 一致しても自動でPASSへ変更しない。

理由:

- 2つのGETは現在状態を返し、request IDを返さない。
- attendance rowにはsession IDがあるが、上記GET契約から当該sessionを直接照合できない。
- 同じ状態が他の操作で成立した可能性がある。
- `getMemberInfo`は集計で、単一Runの請求を識別しない。

したがって既存契約だけでは「当該Runが書いた」と確定できない。専用fixtureの実行前0件証跡、安定session ID、時刻範囲、業務応答などを人が総合確認し、手動resolutionを行う。request IDの業務永続化またはrequest receiptが将来追加されれば確度を上げられるが、D-1では業務API/DTOを変更しない。

手動resolutionは`resolved_status=PASS|FAIL|ABORTED_UNCONFIRMED`、resolver、理由、証拠digest、日時を新規documentとして追記し、元のUNKNOWNを削除・上書きしない。B-2へ渡せるPASSは、許可されたresolution policyを満たすものだけとする。

## 9. TimeTripとの整合

TimeTrip lifecycleは業務Event stateと分離してRunへ記録する。

```text
BASELINE_CAPTURED
  -> SET_INTENT_RECORDED
  -> SET_VERIFIED
  -> RESTORE_INTENT_RECORDED
  -> RESTORED
  または RESTORE_FAILED / RECOVERY_REQUIRED
```

- baseline本体とdigestをTimeTrip変更前に耐久保存する。
- B-3 verify成功結果をLedgerへ保存・読戻し後にのみEvent予約へ進む。
- 業務送信状態がPASS/FAIL/BLOCKED/UNKNOWNのいずれでも、finally相当経路でrestoreを試みる。
- restore成功はreadback一致まで必要。
- restore失敗はEvent UNKNOWNとは別に`time_trip.status=RESTORE_FAILED`、Run=`RECOVERY_REQUIRED`とする。
- `RESTORE_FAILED`またはプロセス停止で`SET_VERIFIED`が残る場合、environment lockを保持し、他Runを開始しない。lockの時限切れだけで自動解放しない。
- 再起動後はLedger baselineを読み、既存TimeTrip read/restore契約で復元・読戻しする。復元不能なら全Runnerを停止し手動対応する。

共有DEVであるため、environment lockはRun IDではなく`dojo-management-dev/dev-firebase`単位に1つとする。

## 10. Mock結果と実DEV結果の分離

証跡種別を最低限次に分ける。

- `MOCK_ONLY`: C-2等のローカルMock。Firestore実行claimへ保存せず、B-2の実DEV継続結果として利用不可。
- `DEV_LIVE`: DEV認証、DEV target、Ledger claim、TimeTrip verify、実WebConnect、read-after-writeの証跡を持つ。
- `MANUAL_RESOLUTION`: UNKNOWNに対する追記型の人手判定。policy/versionとresolverが必要。

B-2へ結果を渡すprovenance validatorは次を全照合する。

- Run ID、Event ID、安定claim owner
- Manifest/Event/Fixture/Payload/Expected fingerprints
- `projectId=dojo-management-dev`、`target=dev-firebase`
- evidence kindが`DEV_LIVE`または許可された`MANUAL_RESOLUTION`
- terminal resultとread-after-write状態
- TimeTrip verify、restore/recovery状態
- Event/claim version、改変検知

不一致、Mock、結果未登録、UNKNOWN、復元失敗は継続PASSとして扱わない。

## 11. D-2実装範囲案

D-2は実通信なしの純粋モデル＋Mock repositoryまでに限定する。

1. canonical JSONとfingerprint関数。
2. Ledger schema validator。
3. 安定イベントキー生成（`executionScopeId`確定後）。
4. 注入Repositoryを使うreserve/recordIntent/markInFlight/finish/markUnknown。
5. Mock Firestore transactionによる同時予約競合テスト。
6. 再起動時のSEND_INTENT/IN_FLIGHT→UNKNOWN判定。
7. TimeTrip lifecycleの別状態モデル。
8. evidence provenance validatorとB-2用結果投影。ただし`businessExecutionAllowed=false`。
9. ローカル不変JSONミラーを採用する場合は、既存`fsync`・排他作成・読戻し方式を再利用する。

D-2では実Firestore repository、実TimeTrip Adapter、実Business Transport、UI、cleanup、業務実行許可を実装しない。

## 12. 未解決事項

優先度順:

1. `executionScopeId`の正式な発行・終了・再試験ルール。Run IDやfingerprint変更で再送可能にしてはならない。
2. Ledger用Firestore collection名、Security Rules、管理主体。ブラウザから直接書かず、信頼されたDEV実行主体だけに限定する必要がある。
3. Run/Event/claimを同一Firestore transactionで予約する具体的repository境界。既存業務DAOへ混在させない。
4. attendance E010でrequest IDが業務永続化されないため、UNKNOWNの機械的帰属確認ができない。
5. `attendance_session_id`を既存read-only契約だけで照合可能か。現在の2 GETでは不可。
6. 手動resolutionをB-2 PASSとして認めるpolicy、承認者、監査項目。
7. Manifest fingerprintのcanonical対象。生成メタデータを含めるか除外するか。
8. environment lockの回復手順。TimeTrip復元失敗時は自動解放禁止。
9. Ledgerの保存期間、個人情報最小化、cleanup後もclaimを保持する期間。
10. GAS側との将来共通化。D-1はFirebase DEVを対象とし、GAS transportには適用しない。

## 13. 安全確認

- 実API・Firebase・Firestoreへ接続していない。
- TimeTripを変更していない。
- 業務API・DAO・DTOを変更していない。
- B-1/B-2/B-3/C-2の公開契約を変更していない。
- TASK-DEV-024には着手していない。
- stage、commit、push、deployは実施していない。
- `businessExecutionAllowed=false`を設計上維持している。
