# STORY-902 D-3c DEV実Firestore接続準備・安全境界

作成日: 2026-10-25

基準: `main` / `2cd8beb`

範囲: Firebase/IAM調査、executionScopeId仕様、Environment lock実装・Mock検証、接続承認チェックリスト。実DEV Firestore接続・書込み、IAM変更、Event送信、TimeTrip変更は実施していない。

## 1. 結論

DEV実Firestore接続前のfail-closed境界を実装した。target profile、process environment、Cloud Run管理構成由来の実行主体、生成済みAdmin SDK clientのproject/databaseを異なる情報源として照合し、すべて一致した場合だけclientを返す。ただしattestationは`firestoreOperationAllowed=false`、`businessExecutionAllowed=false`のままで、D-3c完了は実接続・書込みの承認を意味しない。

現行Cloud Runは既定Compute Service Accountを使用し、project-level `roles/editor`を持つ。これはRun Ledgerだけに必要な権限より広い。今回IAMは変更していない。実DEV検証前に専用実行主体または既存主体の利用判断と最小権限レビューが必要である。

## 2. D-3b限定コミット

- Commit: `2cd8beb test(story902): verify firestore run ledger with emulator`
- 対象: D-3b関連6ファイルのみ
- D-3b 14/14、D-3a 20/20、D-2 18/18、B-1〜C-2＋既存回帰301/301 PASS
- push/deployなし

## 3. DEV Firebase構成調査

### 3.1 確認結果

2026-10-25にローカル設定とGCP管理プレーンをread-onlyで確認した。

| 項目 | 確認値 | 根拠 |
|---|---|---|
| Firebase/GCP project | `dojo-management-dev` | `targets/dev-firebase.json`、Cloud Run service |
| Project number | `374758850136` | Cloud Run service namespace |
| Firestore database | `(default)` | `gcloud firestore databases list` |
| Database type | `FIRESTORE_NATIVE` | 同上 |
| Database location | `asia-northeast1` | 同上 |
| Cloud Run service | `dojo-time-travel-admin` | target設定、service describe |
| Latest ready revision | `dojo-time-travel-admin-00078-bir` | service describe |
| 実行Service Account | `374758850136-compute@developer.gserviceaccount.com` | `spec.template.spec.serviceAccountName` |
| Admin SDK初期化 | `initializeApp({credential: applicationDefault(), projectId})`相当 | `cloud/api/server.cjs` |
| Firestore client | `getFirestore(firebaseApp)` | `cloud/api/server.cjs` |
| 既存REST database path | `projects/{project}/databases/(default)/documents` | `cloud/member-read/DAO_Core_Firestore.cjs` |

Firestore databaseのdelete protectionは`DELETE_PROTECTION_DISABLED`だった。今回変更していない。

### 3.2 Collection管理とDAO/DTO

- 業務collectionはschema、DAO Definitions、Firestore adapterの物理mappingで管理される。
- Run Ledgerは業務データではなく、STORY-902専用テスト基盤である。既存業務DAO/DTOやWebConnectへ混在させない。
- D-3系の専用collection候補は次の4件で固定する。
  - `story902_execution_scopes`
  - `story902_runs`
  - `story902_event_claims`
  - `story902_environment_locks`
- 実DEV書込み前に、collection名、保存期間、index、バックアップ、cleanup禁止期間をschema/運用台帳へ登録する承認が必要。
- ブラウザから直接アクセスさせず、信頼されたserver/admin runnerのRepository境界だけを使用する。

## 4. IAM調査

### 4.1 現状

Cloud Run実行主体`374758850136-compute@developer.gserviceaccount.com`はproject-level `roles/editor`を持つ。Service Account自身のIAM policyには追加bindingは表示されなかった。

`roles/editor`はRun Ledger操作に対して過大である。Firestore Admin SDKはSecurity Rulesを迂回するため、deny-all rulesだけでは安全境界にならない。

### 4.2 必要最小限の候補

Firestore transactionで必要な能力はdatabase metadata取得とentityのget/list/create/updateである。Claimを通常削除しないためdelete権限はRun Ledger Repository自体には不要である。

既定role候補`roles/datastore.user`は次を含むが、delete、schema/statistics、project list等も含み、完全な最小権限ではない。

- `datastore.databases.get`
- `datastore.entities.get/list/create/update`
- `datastore.entities.delete`等

推奨順:

1. STORY-902専用の非ブラウザ実行主体を用意するかを判断する。
2. 専用主体を採用する場合は、必要permissionだけのcustom roleをセキュリティレビューする。
3. 既存Cloud Run主体を使う場合も、`roles/editor`を前提に安全とは判断せず、service全機能への影響を棚卸しして段階的に権限を縮小する。
4. IAM変更は別承認・別作業とし、D-3cでは行わない。

## 5. executionScopeId仕様

### 5.1 役割

executionScopeIdは、同じfixture世代・Manifest・検証目的に対する一度限りの業務イベント集合を識別する。Run IDやrequest IDとは別であり、Runner再起動やプロセス再開で変更しない。Claim keyの一部なので、変更は同じEventの新規実行を可能にする強い管理操作である。

### 5.2 生成主体と形式

- 生成主体: STORY-902のテスト責任者。通常Runnerは生成・変更できない。
- 発行処理: 将来の管理用CLIが、明示承認を受けて`story902_execution_scopes/{executionScopeId}`をtransaction createする。
- 形式: `STORY902_SCOPE_<fixture-generation>_<serial>`を推奨する。
- 例: `STORY902_SCOPE_20261025_APPLY01_001`
- Run ID、request ID、現在時刻だけから自動生成しない。
- D-2のidentifier制約（英数字、`. _ -`、最大128文字）を満たす。

### 5.3 Scope document

```json
{
  "schemaVersion": 1,
  "executionScopeId": "STORY902_SCOPE_20261025_APPLY01_001",
  "projectId": "dojo-management-dev",
  "target": "dev-firebase",
  "storyId": "STORY-902",
  "fixtureGenerationId": "STORY902_E010_20261025_APPLY01",
  "manifestFingerprint": "sha256",
  "fixtureFingerprint": "sha256",
  "state": "PREPARED|ACTIVE|CLOSED|RECOVERY_REQUIRED|ABORTED_UNCONFIRMED",
  "approvalReference": "human-approved record",
  "createdAt": "server timestamp",
  "closedAt": null
}
```

### 5.4 再利用条件

同一scopeを再利用できるのは、同じfixture generation、Manifest fingerprint、fixture fingerprintで、同一の47イベント実行をプロセス停止後に再開するときだけである。再開は既存Ledgerを読み、NOT_STARTEDイベントの判定へ進む。既存Claimを再予約・削除しない。

Run ID、request ID、session ID、Runner process、認証tokenが変わってもscopeは変えない。fingerprint不一致はscope変更で回避せず停止する。

### 5.5 新規発行条件

次をすべて満たす場合だけ、人の再承認を経て新規発行できる。

1. 旧scopeが`CLOSED`または人手で`ABORTED_UNCONFIRMED`に確定している。
2. UNKNOWN、IN_FLIGHT、SEND_INTENT_RECORDED、RESERVED recoveryが残っていない。
3. TimeTripがbaselineへ復元され、Environment lockが正常解放されている。
4. 旧fixtureの業務生成データと所有証跡を確認し、再試験用の新しい隔離fixture generationが承認されている。
5. 新規発行理由、承認者、旧scopeとの関係が記録される。

テスト失敗、期待値変更、request ID変更、Runner再起動だけでは新規発行できない。executionScopeIdを重複防止回避に利用しない。

### 5.6 異常終了

異常終了時はscopeを`RECOVERY_REQUIRED`にし、新規scope発行と既存scopeのEvent送信を停止する。Ledger、Claim、TimeTrip、fixtureをread-only照合し、UNKNOWNを自動再送しない。解決不能なら`ABORTED_UNCONFIRMED`として証跡を保持し、自動cleanupしない。

## 6. Environment lock実装

### 6.1 ファイル

- `work/story902-dev-environment-lock.cjs`
- `work/verify-story902-dev-environment-lock.cjs`

### 6.2 検証源

呼出側の単一booleanやproject文字列を信用せず、次を照合する。

1. Environment lock自身が保持する承認済み定数。
2. target profile readerが返す`targets/dev-firebase.json`相当の内容。
3. process environmentのproject/database/Emulator override。
4. Cloud Run管理構成を確認したruntime identity inspector。
5. client factoryが生成したAdmin SDK clientの`projectId`、`databaseId`、`app.options.projectId`。

runtime identity inspectorは、将来の実接続compositionでCloud Run metadataまたは事前に署名・固定されたrelease manifestから作る。画面payloadや任意のCLI引数をそのままidentityとして渡してはならない。

### 6.3 接続順序

```text
Emulator/key-file/project env拒否
 -> target profile読取・照合
 -> runtime identity読取・照合
 -> client生成（まだFirestore operationなし）
 -> SDK project/database/app照合
 -> attestation返却
```

不一致時はclient生成前、またはSDK object照合時に例外で停止する。正しい設定でもattestationは次を維持する。

```text
firestoreOperationAllowed=false
businessExecutionAllowed=false
```

実際のRepository operation能力はD-3cで発行しない。

### 6.4 拒否条件

- project/confirmed project/target/mode/runtime不一致
- database IDが`(default)`以外
- `FIRESTORE_EMULATOR_HOST`、`FIREBASE_AUTH_EMULATOR_HOST`、`FIRESTORE_HOST`混入
- `GOOGLE_APPLICATION_CREDENTIALS`によるkey file指定
- project環境変数が本番・別project
- 未確認または異なるCloud Run service/service account
- Admin SDK appとFirestore clientのproject不一致
- collection/runTransaction能力を持たないclient

## 7. Environment lockテスト

`node work/verify-story902-dev-environment-lock.cjs`

- 9/9 PASS
- 正しいDEV設定
- project ID不一致
- database ID不一致
- Emulator設定混入
- 未設定profile
- 本番project ID
- 不正実行主体
- key-file認証混入
- SDK app project不一致

すべてMock inspector/clientで実施し、実Firestoreへ接続していない。不正なpreconditionではclient factory呼出回数0、SDK target不一致ではFirestore operation 0を確認した。

## 8. DEV接続承認チェックリスト

D-3c完了後も、以下をすべて人が確認し、別指示で承認するまで接続しない。

### 接続先・実行主体

- [ ] project=`dojo-management-dev`を明示
- [ ] database=`(default)`を明示
- [ ] region/location=`asia-northeast1`を確認
- [ ] target=`dev-firebase`、mode=`development`を確認
- [ ] Emulator関連環境変数が全て未設定
- [ ] key-file認証を使用しない
- [ ] 実行serviceとservice accountを管理プレーンで直前再確認
- [ ] 専用主体または既存主体を使う理由とIAMレビューを承認
- [ ] Environment lock 9/9と実行直前attestation PASS

### データ隔離

- [ ] 専用4 collectionをschema/運用台帳へ登録
- [ ] executionScopeIdを人が承認しscope documentを作る手順を確認
- [ ] Manifest/fixture fingerprintsを固定
- [ ] 既存Claim、Run、scope、environment lockをread-only preflight
- [ ] STORY-902専用fixture ownershipを確認
- [ ] 保存期間、cleanup禁止期間、バックアップ方針を確認

### 今回の接続範囲

- [ ] 最初の接続はread-only metadata/preflightに限定
- [ ] Ledger書込みを行う場合は対象document pathを別途提示・承認
- [ ] 業務Event送信禁止
- [ ] TimeTrip変更禁止
- [ ] 既存業務collectionへの書込み禁止
- [ ] API endpoint追加禁止

### 証跡・中断

- [ ] Run ID、scope、fingerprints、principal、project/databaseをログへ記録
- [ ] token、Authorization、秘密鍵、個人情報をログへ出さない
- [ ] SEND_INTENT/IN_FLIGHT/UNKNOWNの自動再送禁止
- [ ] SDK結果不明、readback不一致、partial documentで即停止
- [ ] TimeTrip/environment lock異常で後続全停止
- [ ] 接続後のreadbackと終了時の状態確認手順を用意

## 9. 未解決事項・リスク

1. 現行Cloud Run SAの`roles/editor`は過大。最小IAMへの変更は影響調査と別承認が必要。
2. STORY-902専用実行主体をCloud Run、ローカル管理CLI、別Jobのどれに置くか未決定。
3. `story902_execution_scopes`を含むcollection/schema台帳登録は未実施。
4. Environment lockのruntime identity inspector実Adapterは未実装。今回の単体テストはMockのみ。
5. Scope発行・close・manual resolution CLIは未実装。
6. Environment lock documentとTimeTrip baseline/restoreの耐久統合は未実装。
7. Firestore実接続時のSDK error分類、deadline、readback待機時間は未確定。
8. 実DEV接続は未承認であり、D-3cから自動的にD-3dへ進めない。

## 10. 安全確認

- GCP調査はCloud Run/Firestore/IAM管理プレーンのread-only commandだけを使用した。
- Firestore data API、実DEV documentへ接続・書込みしていない。
- IAMを変更していない。
- Event送信、TimeTrip変更、API追加を行っていない。
- D-3cファイルはstage・commitしていない。
- push・deployしていない。
