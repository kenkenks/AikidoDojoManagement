# STORY-902 D-3d DEV接続直前安全ゲート

作成日: 2026-10-25

基準: `main` / `de30574`

範囲: IAM・SDK初期化経路の調査、Environment lock統合Mock、RECOVERY_REQUIRED運用、DEV接続承認ゲート。実DEV Firestore、IAM、業務Event、TimeTripは変更していない。

## 1. 結論

D-3dのオフライン安全検証はPASSしたが、実DEV Firestore接続はNO-GOである。理由は、専用実行主体と最小IAM方針、runtime identity実Inspector、専用collection台帳登録、実executionScopeId発行記録が未確定だからである。

Environment lockと承認付きcompositionにより、明示承認なしではSDK client factoryもRepository factoryも呼ばれない。承認後もprofile、process environment、Cloud Run構成由来identity、生成clientのproject/databaseを照合し、不一致ならFirestore operation前に停止する。業務Event送信とTimeTrip変更は常に禁止状態のままである。

## 2. D-3c限定コミット

- Commit: `de30574 feat(story902): add dev firestore environment lock`
- 対象: 指定3ファイルのみ
- Environment lock: 9/9 PASS
- 構文、`git diff --cached --check`: PASS
- push/deployなし

## 3. IAM調査結果

### 3.1 現在の実行主体と権限

GCP管理プレーンをread-onlyで確認した。

| 項目 | 現在値 |
|---|---|
| Project | `dojo-management-dev` |
| Firestore database | `(default)` / `asia-northeast1` |
| Cloud Run service | `dojo-time-travel-admin` |
| Service Account | `374758850136-compute@developer.gserviceaccount.com` |
| Project role | `roles/editor` |

project内に存在するService Accountは次の2件だった。

- `374758850136-compute@developer.gserviceaccount.com`
- `firebase-adminsdk-fbsvc@dojo-management-dev.iam.gserviceaccount.com`

STORY-902専用Service Account、STORY-902用custom roleは存在しない。IAM変更は行っていない。

### 3.2 roles/editorを使わない方針

推奨は、既存Cloud Run serviceの実行主体を直ちに変更せず、STORY-902専用の非HTTP Runner（Cloud Run Jobまたは承認済み管理Runner）へ専用Service Accountを割り当てる方式である。新しい業務API endpointは作らない。

理由:

- 既存Cloud Runは認証、出席、会費、OCR等を同一serviceで扱い、Service Account変更は全機能に影響する。
- 現行Compute SAの`roles/editor`はRun Ledger検証に対して過大である。
- Firebase Admin SDK用SAはFirebase管理用途の権限を持ち、STORY-902 Runnerへの流用は責務分離に反する。
- 専用主体ならIAM、監査ログ、停止、廃止をSTORY-902範囲へ限定できる。

### 3.3 必要最小限の権限

Run Ledgerの予約・読戻し・状態更新に必要なデータ権限候補:

- `datastore.databases.get`
- `datastore.entities.get`
- `datastore.entities.list`（scope/runの管理照合で必要な場合のみ）
- `datastore.entities.create`
- `datastore.entities.update`
- `resourcemanager.projects.get`（実行時project照合に必要な場合）

通常RunnerはClaimを削除しないため`datastore.entities.delete`を付けない。`roles/datastore.user`は必要能力を含むがdelete等も含み、厳密な最小権限ではない。custom roleを採用する場合は、Firestore transactionに必要な実権限をEmulatorではなくDEVのread-only/限定write承認工程で検証する。

### 3.4 既存Cloud Runへの影響

- 現行service account/roleを変更しない限り既存Cloud Runへの影響はない。
- 既存Cloud Run SAから`roles/editor`を除去する作業は、本機能とは分離し、全既存機能の権限回帰が必要。
- 既存serviceへLedger compositionを追加する場合でも、新endpointは追加せず、起動時の通常業務経路へ影響しない構成が必要。
- 推奨する専用Job/Runner案も、作成・配備・IAM変更は別承認で行う。

## 4. Environment lock統合

### 4.1 追加ファイル

- `work/story902-dev-firestore-composition.cjs`
- `work/verify-story902-dev-firestore-composition.cjs`

### 4.2 初期化順序

```text
信頼済み承認記録の読取・署名/出所検証
  -> process envのEmulator/key-file/別project拒否
  -> target profile照合
  -> Cloud Run service configuration由来identity照合
  -> SDK client factory実行（まだFirestore operationなし）
  -> client.projectId/databaseId/app.options.projectId照合
  -> Repository factory実行
```

既存`cloud/api/server.cjs`はmodule起動時に`initializeApp`と`getFirestore`を直接行う。D-3dでは既存serverを変更していない。STORY-902を接続する将来compositionでは、その直接初期化とは別に上記guarded compositionを必須入口とし、Repositoryをグローバル生成しない。

### 4.3 承認モデル

承認記録には最低限次を要求する。

- `source=TRUSTED_APPROVAL_ADAPTER`
- `kind=STORY902_DEV_FIRESTORE`
- `status=APPROVED`
- approval ID
- executionScopeId
- project/database/target/service account
- 有効期限

画面payloadや任意CLI引数を信頼済み承認として扱わない。将来の実Adapterは、耐久・監査可能な承認記録を読み、出所を検証して返す必要がある。

### 4.4 生成能力

全条件一致時だけRepositoryを生成し、次の能力を返す。

```text
repositoryOperationAllowed=true
businessExecutionAllowed=false
eventSendAllowed=false
timeTripChangeAllowed=false
```

したがって、接続承認はLedger Repository操作だけを対象とし、業務EventやTimeTripの権限へ拡張されない。

## 5. オフライン統合検証

### Environment lock

- 9/9 PASS
- project/database/Emulator/key-file/identity/SDK targetの不一致を拒否

### Guarded composition

- 7/7 PASS
- 正常なMock承認＋Environment lock後だけRepositoryを生成
- 承認なし・期限切れではSDK client factory 0回
- Emulator混入・不正identityではSDK client factory 0回
- SDK project/database不一致ではRepository factory 0回
- 成功時もEvent送信・TimeTrip・業務実行はfalse

実Firebase SDK、Firestore data API、実credentialは使用していない。

## 6. RECOVERY_REQUIRED運用

### 6.1 責任者

- 復旧開始・最終判断: STORY-902テスト責任者
- 環境/IAM/TimeTrip確認: DEV環境管理責任者
- 1人開発環境では同一人物でもよいが、「実行操作」と「復旧判断」を別の時刻・別の監査記録として残す。
- Runner自身はPASS/FAIL決定、新規scope発行、再送を行わない。

### 6.2 最初の停止処理

1. Runを`RECOVERY_REQUIRED`として後続Eventを停止する。
2. Environment lock documentを保持し、自動解放しない。
3. Claim、Event、Run、scope、TimeTrip証跡を変更せずread-onlyで取得する。
4. token、秘密鍵、レスポンス全文をログへ保存しない。

### 6.3 Claim/Event確認

安定Claim keyから次を照合する。

- project、target、story、executionScopeId、eventId
- owner Run ID
- Manifest/fixture/event/payload/expected fingerprints
- state、version、request ID、session ID
- evidence kind
- send intent/in-flight/finished timestamps
- read-after-write status

部分存在、fingerprint不一致、version不整合、読取失敗は自動修復せず停止する。

### 6.4 Event送信済みか不明な場合

- SEND_INTENT_RECORDED、IN_FLIGHT、通信応答喪失はUNKNOWNとする。
- `member_attendance_state`、`getMemberInfo`等の既存read-only契約で現在状態を照合する。
- 現在状態がExpectedと一致しても、当該Runの書込みと一意に帰属できなければUNKNOWNのままとする。
- UNKNOWNを自動的にPASS/FAILへ変更しない。
- request/session IDを業務側で一意照合できない限り自動再送しない。
- 人手resolutionは元UNKNOWNを上書きせず、承認者、理由、evidence digest、判断時刻を追記する。

### 6.5 TimeTrip確認

1. Ledgerのbaseline、expected、set/verify/restore evidenceを読む。
2. 既存TimeTrip管理者readと公開`system_context`の双方で現在値を確認する。
3. baseline一致までEnvironment lockを保持する。
4. 不一致・片側読取失敗は`RESTORE_FAILED`/`RECOVERY_REQUIRED`として後続全停止。
5. 復元操作は別承認を要し、Event結果と独立して記録する。

### 6.6 再開・再実行条件

同じexecutionScopeIdで許可できるのは、ClaimがないNOT_STARTED Eventからの継続だけである。既存ClaimがRESERVED/SEND_INTENT/IN_FLIGHT/UNKNOWN/terminalなら再予約しない。

新規executionScopeIdは次の全条件を満たす場合だけ発行できる。

1. 旧scopeの全ClaimとEventを確認し、UNKNOWN/中間状態がない、または人手resolution済み。
2. TimeTrip baseline復元を2経路で確認。
3. Environment lockを監査付きで解放。
4. 旧fixtureの業務生成データを照合し、新しい隔離fixture generationを承認。
5. 新規scope理由、旧scope、承認者、fingerprintsを耐久保存。

Run ID、request ID、失敗、期待値変更だけを理由に新規scopeを発行しない。

### 6.7 監査証跡

- recovery ID、Run/scope/Event/Claim IDs
- 実行者・判断者の監査識別子
- before/after stateとversion
- read-only取得時刻・結果digest
- TimeTrip二経路確認
- manual resolution policy/version
- 新規scope発行の有無と理由
- 実施した全コマンド種別と終了状態

既存recordを削除・置換せず、追記型resolution documentとして保存する。

## 7. DEV接続承認ゲート

現時点の判定: **NO-GO**

| 条件 | 状態 |
|---|---|
| D-3dオフライン検証 | PASS |
| IAM方針 | 未確定（推奨案提示のみ） |
| Environment lock統合 | Mock PASS、実Inspector未実装 |
| 専用test collection | 名称確定、台帳登録未実施 |
| executionScopeId運用 | 仕様確定、発行記録/CLI未実装 |
| RECOVERY_REQUIRED手順 | 定義済み、実運用リハーサル未実施 |
| 実DEV接続の明示承認 | 未取得 |

### 接続前チェックリスト

- [ ] 専用Service Accountまたは既存主体の採用を承認
- [ ] 最小IAM roleと影響範囲を承認
- [ ] Cloud Run metadata/release manifestを読むruntime identity実Inspectorを実装・検証
- [ ] 専用4 collectionをschema/運用台帳へ登録
- [ ] executionScope document発行と監査記録を用意
- [ ] RECOVERY_REQUIRED手順をMock/Emulatorでリハーサル
- [ ] 接続対象project/database/service accountを管理プレーンで直前再確認
- [ ] Environment lock実attestationを業務操作なしで確認
- [ ] 最初の接続範囲をread-onlyに限定
- [ ] Ledger writeを行う場合はpath、件数、rollback不能条件を別途提示
- [ ] Event送信禁止、TimeTrip変更禁止を再確認
- [ ] ユーザーから実DEV接続の明示承認を取得

## 8. 次段階への移行条件

D-3eまたは実DEV read-only接続へ進むには、上記NO-GO項目を解消し、接続先・主体・操作内容を再提示して承認を得る。D-3d完了だけでは自動的に接続しない。

推奨する次作業は、実接続ではなく次の3点である。

1. 専用Service Account/custom role案のレビュー。
2. runtime identity実Inspectorとscope approval readerのオフライン実装。
3. RECOVERY_REQUIREDのEmulatorリハーサル。

## 9. 安全確認

- IAM、Cloud Run、Firestore設定を変更していない。
- Firestore data APIへ接続・書込みしていない。
- Event送信、TimeTrip変更、API endpoint追加を行っていない。
- D-3dファイルはstage・commitしていない。
- push・deployしていない。
