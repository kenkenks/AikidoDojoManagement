# STORY-902 D-3f DEV接続最終準備

作成日: 2026-10-25

基準: `main` / `efcc88c`

範囲: IAM実行計画、Firestore物理構造、read-only Inspectorオフライン実装、実DEV限定検証計画、GO/NO-GO判定。実DEV Firestore、IAM、Service Account、業務Event、TimeTripは変更していない。

## 1. 結論

D-3fの計画とread-only Inspector契約はオフラインで完成した。InspectorはEnvironment lock attestationと読取専用Adapterを必須とし、Claim、Event、TimeTrip、environment lock、復旧証跡を一括照合する。8/8テストがPASSした。

ただし実DEV接続は **NO-GO** である。専用Service Account/custom roleが未作成、runtime identity実Inspectorと承認記録Readerが未接続、schema/運用台帳登録と明示承認が未完了である。D-3f完了は接続承認を意味しない。

## 2. D-3e確定

- Commit: `efcc88c test(story902): verify run ledger recovery procedures`
- 復旧訓練: 6/6 PASS
- 構文、`git diff --cached --check`: PASS
- 指定2ファイルのみコミット。push/deployなし。

## 3. IAM実行計画

以下は承認後に実行するための計画であり、本工程では一切実行していない。

### 3.1 固定値

```text
PROJECT_ID=dojo-management-dev
SA_ID=story902-run-ledger-dev
SA_EMAIL=story902-run-ledger-dev@dojo-management-dev.iam.gserviceaccount.com
ROLE_ID=story902RunLedgerDev
ROLE_NAME=projects/dojo-management-dev/roles/story902RunLedgerDev
```

### 3.2 Custom Role定義案

保存候補: 承認工程で一時ファイル`story902-run-ledger-role.yaml`を作成する。Gitへ秘密情報を保存しない。

```yaml
title: STORY-902 Run Ledger DEV
description: Minimal DEV-only Firestore access for STORY-902 Run Ledger
stage: ALPHA
includedPermissions:
  - datastore.databases.get
  - datastore.entities.get
  - datastore.entities.list
  - datastore.entities.create
  - datastore.entities.update
  - resourcemanager.projects.get
```

`datastore.entities.delete`、IAM変更、Cloud Run変更権限は含めない。Firestore IAMはcollection単位に絞れないため、専用主体、Repository path allowlist、Environment lock、監査ログを併用する。

### 3.3 作成・付与コマンド案

```powershell
gcloud iam service-accounts create story902-run-ledger-dev `
  --project dojo-management-dev `
  --display-name "STORY-902 Run Ledger DEV"

gcloud iam roles create story902RunLedgerDev `
  --project dojo-management-dev `
  --file story902-run-ledger-role.yaml

gcloud projects add-iam-policy-binding dojo-management-dev `
  --member "serviceAccount:story902-run-ledger-dev@dojo-management-dev.iam.gserviceaccount.com" `
  --role "projects/dojo-management-dev/roles/story902RunLedgerDev" `
  --condition=None
```

既存`374758850136-compute@developer.gserviceaccount.com`、Cloud Run service/revision/trafficには触れない。

### 3.4 認証方法と実行場所

第一候補は専用Cloud Run JobへこのSAを割り当て、ADC/metadata identityを使う方式。HTTP endpointは作らない。Job作成前の限定検証は、承認済み管理端末から短期のService Account impersonationを使い、長期JSON keyを作らない。

Operatorへ必要な`roles/iam.serviceAccountTokenCreator`は、既存保有状況をread-only確認し、不足時は別IAM承認とする。SA自身や公開主体へ付与しない。

### 3.5 権限検証

1. 管理プレーンでSA、custom role、bindingをread-only取得。
2. impersonated identityのemail/projectを取得しEnvironment lockと照合。
3. Inspectorによる専用pathのread-only確認を最初に行う。
4. 業務collection、IAM、Cloud Run、TimeTripへの操作がないことを監査ログで確認。
5. Ledger書込みは別承認後、最大1 scope、1 run、1 event、1 claimから開始する。

### 3.6 ロールバック計画

接続異常時はEvent送信を行わず、まずSAを無効化する。その後、証跡を保存してbindingを外す。custom role/SA削除は調査完了後の別承認とする。

```powershell
gcloud iam service-accounts disable `
  story902-run-ledger-dev@dojo-management-dev.iam.gserviceaccount.com `
  --project dojo-management-dev

gcloud projects remove-iam-policy-binding dojo-management-dev `
  --member "serviceAccount:story902-run-ledger-dev@dojo-management-dev.iam.gserviceaccount.com" `
  --role "projects/dojo-management-dev/roles/story902RunLedgerDev" `
  --condition=None
```

custom role削除ではなく最初はdisableを選び、監査可能性を残す。既存Compute SAを変更しない。

## 4. Firestore構造の確定

| Path | Document ID | Transaction/用途 |
|---|---|---|
| `story902_execution_scopes/{executionScopeId}` | 承認済み明示ID | scope発行はtransaction create。通常Runnerは更新不可 |
| `story902_runs/{runId}` | Runner session ID | Claim初回予約transactionでcreate |
| `story902_runs/{runId}/events/{eventId}` | `902-Eddd` | Claimと同一transactionでcreate/update |
| `story902_runs/{runId}/recovery_audits/{recoveryId}` | 追記型ID | 復旧判断をcreate-onlyで保存 |
| `story902_event_claims/{stableEventKey}` | 5要素canonical SHA-256 | Run/Eventと同一transactionで原子的予約 |
| `story902_environment_locks/{projectId_target}` | `dojo-management-dev_dev-firebase` | environment/scope停止状態 |

Claimキーの5要素は`projectId + target + storyId + executionScopeId + eventId`。Run ID、request ID、fixture変更で変化しない。Claim、Run、Eventの初回作成は単一transaction、Event/Claimのversion更新も単一transactionとする。復旧auditは既存証跡を上書きせずcreate-only。

全documentは`storyId=STORY-902`、`target=dev-firebase`、承認済みscope、専用SA audit principal、schema version、evidence kindでDEV検証データと識別する。既存業務collection、DAO、DTOは変更しない。

保持期間はデモ・UNKNOWN調査終了まで削除禁止。terminal、UNKNOWN、recovery auditは自動cleanupしない。削除はscope閉鎖後、参照・件数・TimeTrip復元をread-only確認し、別承認・専用cleanup・監査記録で行う。

## 5. read-only Inspector

### 5.1 実装

- `work/story902-run-ledger-inspector.cjs`
- `work/verify-story902-run-ledger-inspector.cjs`

InspectorはFirestore SDKを直接初期化しない。D-3d Environment lockが発行したattestationと、`getDocument/listCollection`だけを公開する読取Adapterを注入する。create/set/update/delete/runTransaction/sendEvent能力を持つAdapterは生成時に拒否する。

### 5.2 読取内容

- Claim documentとowner Run ID
- Run document
- Event document、version、結果状態
- Event内TimeTrip復元状態
- Run配下のrecovery audits
- environment lock
- Claim/Event/Run整合、`businessExecutionAllowed=false`
- RECOVERY_REQUIRED理由と全体evidence digest

Inspectorの返却能力は常に`readOnly=true`、`businessExecutionAllowed=false`、`eventSendAllowed=false`、`timeTripChangeAllowed=false`。

### 5.3 オフライン検証

8/8 PASS:

1. Claim/Event/TimeTripの正常read-only取得
2. UNKNOWNのRECOVERY_REQUIRED識別
3. TimeTrip復元不明と復旧証跡識別
4. environment lock RECOVERY_REQUIRED識別
5. Claim/Event不整合の遮断
6. Environment attestation不一致を読取前に遮断
7. 書込み能力を持つAdapterの拒否
8. Inspector公開契約に書込み操作がないこと

実SDK、credential、実Firestoreは使用していない。

## 6. DEV限定検証計画

### Phase 0: 直前read-only確認

- project=`dojo-management-dev`、database=`(default)`、専用SA、Emulator envなしを管理プレーンで確認。
- Environment lockと明示承認を検証。
- Inspectorで専用collectionの既存件数・既存Claimをread-only確認。
- 1項目でも不一致なら停止。

### Phase 1: 最小write（別承認必須）

- 承認済みexecutionScopeを1件作成。
- Event送信なしでE010用Claimを1件予約。
- 想定最大新規document: scope 1、run 1、event 1、claim 1。
- Inspectorで4件のpath、fingerprint、version、証跡種別を確認。

### Phase 2: 排他・永続性

- 同一Claimの重複予約拒否。
- 同時3 Runnerは成功1件、競合2件。
- Repository再生成後もClaim保持。
- Run/request/fixture変更でも再予約拒否。

### Phase 3: Event送信なし状態遷移

- RESERVEDからSEND_INTENT_RECORDED相当へ進む検証は、業務Transportを注入せずLedgerのみで実施。
- IN_FLIGHT/UNKNOWNは障害訓練用scopeに限定し、自動再送不可を確認。
- 復旧auditをcreate-onlyで1件記録。
- InspectorでEvent、TimeTrip、RECOVERY_REQUIRED、auditを確認。

全Phaseで実Event送信、TimeTrip変更、既存業務collection操作は禁止。UNKNOWN/応答喪失時は新scopeを作らず停止する。

## 7. GO／NO-GO判定

| 条件 | 判定 | 根拠/残作業 |
|---|---|---|
| D-3a〜D-3e契約・Emulator検証 | PASS | Repository、競合、復旧訓練済み |
| D-3f Inspectorオフライン検証 | PASS | 8/8 |
| IAM実行計画 | PASS | コマンド、最小権限、rollbackを定義 |
| 専用SA作成 | NOT_READY | 実変更禁止のため未作成 |
| custom role作成・binding | NOT_READY | 実変更禁止のため未実施 |
| runtime identity実Inspector | BLOCKED | 実主体/metadataとの接続未実装 |
| 承認記録Reader | BLOCKED | 耐久承認源未実装 |
| collection schema/運用台帳登録 | NOT_READY | 運用承認待ち |
| executionScope発行Repository | NOT_READY | 実装・承認待ち |
| 実DEV直前read-only確認 | NOT_READY | 明示承認前のため未実施 |
| 実DEV接続の明示承認 | NOT_READY | 未取得 |

総合判定: **NO-GO**。PASS以外が1件でも残るため実DEVへ接続しない。

## 8. 次の承認単位

1. SA/custom role作成・bindingだけをIAM変更として承認。
2. runtime identity Inspector、承認記録Reader、executionScope発行RepositoryをEmulatorで検証。
3. 管理プレーン確認＋専用collectionへのread-only接続だけを承認。
4. read-only結果確認後、最小write Phase 1を別承認。

各承認は後続権限を含まない。D-3f完了だけで実DEV接続・書込みを開始しない。

## 9. 残課題・安全確認

- custom roleの実権限、IAM反映時間、監査ログを実環境で未検証。
- Firestore IAMはcollection単位でないため、専用SAだけでは誤path書込みを防げない。
- Inspector用Firestore read Adapterは未実装。D-3fは純粋なread-only契約とMock検証まで。
- 実DEV Firestore接続・書込み、SA/IAM変更、Event送信、TimeTrip変更、API追加なし。
- D-3fファイルはstage/commitしていない。push/deployなし。
