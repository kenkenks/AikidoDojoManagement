# STORY-902 D-3e DEV運用準備

作成日: 2026-10-25

基準: `main` / `0a8c1b7`

範囲: 専用実行主体案、Run Ledger collection、executionScopeId運用、Firestore Emulator復旧訓練、DEV接続承認チェックリスト。実DEV Firestore、IAM、サービスアカウント、業務Event、TimeTripは変更していない。

## 1. 結論

D-3eの運用案とEmulator復旧訓練は完成したが、実DEV接続は引き続き **NO-GO** である。専用Service Accountとcustom roleは未作成であり、collectionのschema/運用台帳登録、実行主体の実Inspector、承認記録の耐久保存、実DEV接続の明示承認が残る。

D-3e完了は実DEV接続の自動承認ではない。最初の実接続はread-onlyに限定し、Ledger書込みはpath・件数・主体・停止条件を別途提示して承認を得る。

## 2. D-3d確定

- Commit: `0a8c1b7 feat(story902): enforce dev firestore safety gate`
- D-3d guarded composition: 7/7 PASS
- D-3c Environment lock: 9/9 PASS
- 構文、`git diff --cached --check`: PASS
- 指定3ファイルのみコミット。push/deployなし。

## 3. 専用実行主体

### 3.1 構成案

| 項目 | 提案 |
|---|---|
| Service Account ID | `story902-run-ledger-dev` |
| Principal | `story902-run-ledger-dev@dojo-management-dev.iam.gserviceaccount.com` |
| 表示名 | `STORY-902 Run Ledger DEV` |
| 実行場所 | 認証済みの管理用Cloud Run Jobを第一候補。作成までは承認済みローカル管理Runnerも候補 |
| 認証 | Cloud Run JobはADC/metadata identity。ローカルは短期のWorkload Identity Federationを優先 |
| 禁止 | 長期Service Account key、ブラウザ配布、既存Compute SA/Firebase Admin SAの流用 |
| 既存Cloud Runとの分離 | `dojo-time-travel-admin`のservice account・revision・trafficを変更せず、別Job/主体/ログで隔離 |

IAM変更、Service Account作成、Job作成は本工程では行っていない。

### 3.2 必要権限

通常Runner用custom role候補:

- `datastore.databases.get`
- `datastore.entities.get`
- `datastore.entities.list`
- `datastore.entities.create`
- `datastore.entities.update`
- `resourcemanager.projects.get`（Environment lockのproject照合に必要な場合）

`datastore.entities.delete`、IAM変更、Cloud Run変更、業務collectionアクセスは付与しない。`roles/editor`は使用しない。`roles/datastore.user`はdelete等を含むため暫定検証以外の最終案にしない。collection単位IAMはできないため、専用主体、Repository path allowlist、監査ログの三層で制限する。

## 4. Collection設計

既存業務collectionは変更しない。物理名はD-3cの4件を確定候補とする。

| Collection/path | Document ID | 用途 |
|---|---|---|
| `story902_execution_scopes/{executionScopeId}` | 承認済みscope ID | fixture世代、manifest、承認、状態 |
| `story902_runs/{runId}` | Runner発行Run ID | 1回のRunner session |
| `story902_runs/{runId}/events/{eventId}` | `902-Eddd` | Event状態、結果、TimeTrip状態 |
| `story902_runs/{runId}/recovery_audits/{recoveryId}` | 追記型ID | 復旧判断とread-only照合digest |
| `story902_event_claims/{stableEventKey}` | 5要素のcanonical SHA-256 | Event Claimの一意予約 |
| `story902_environment_locks/{projectId_target}` | `dojo-management-dev_dev-firebase` | 環境停止・復旧状態 |

`stableEventKey`は `project + target + story + executionScopeId + eventId` のcanonical SHA-256。Run ID、request ID、fixture変更で変化しない。全documentに`schemaVersion`、`businessExecutionAllowed=false`、証跡種別を保持する。

DEV検証データは `storyId=STORY-902`、`target=dev-firebase`、承認済み`executionScopeId`、専用SAの監査主体で識別する。既存DAO/DTOには追加せずRun Ledger Repositoryに物理pathを閉じ込め、ARCH-009のデータアクセス境界を維持する。

保持は第3回デモ・調査完了まで削除禁止とし、期間は運用台帳承認時に確定する。terminal/UNKNOWN/recovery auditは自動cleanupしない。削除が必要な場合はscope単位で件数と参照をread-only確認し、別承認・別ツール・監査記録を必須とする。

## 5. executionScopeId運用

- 発行責任者: STORY-902テスト責任者。環境管理責任者が接続先・fixture世代・TimeTrip方針を確認する。
- 形式例: `STORY902_SCOPE_20261025_APPLY01_001`。通常Runnerは採番しない。
- 発行記録: `story902_execution_scopes/{executionScopeId}`をtransaction createし、旧scope、fixture/manifest fingerprint、目的、承認ID、承認者、発行日時、期限を記録する。
- 再利用: 同一fixture世代・manifest・検証目的の再起動/再開では同じscopeを使う。
- 同一Event: Claimが一度でも存在すれば、Run/request/fixtureを変更しても再実行禁止。
- 異常終了: scopeを`RECOVERY_REQUIRED`にしてEvent送信と新scope発行を停止する。
- 新scope条件: 旧scope全Claimを確認、UNKNOWN/中間状態を解決または`ABORTED_UNCONFIRMED`として閉鎖、TimeTrip baseline復元を二経路で確認、fixture隔離、明示承認、旧scopeとの関連を耐久保存した場合だけ。
- 禁止理由: テスト失敗、期待値変更、Runner再起動、request ID変更だけでは新scopeを発行しない。

## 6. RECOVERY_REQUIRED Emulator訓練

### 6.1 追加ファイル

- `work/verify-story902-recovery-drill-emulator.cjs`

既存Firestore Emulator `127.0.0.1:8087`、demo project、`EMULATOR_ONLY`証跡を使用する。実credentialや実DEV接続は使用しない。

### 6.2 シナリオ

実測結果: **6/6 PASS**。Emulator projectは`demo-story902-d3e-recovery`、hostは`127.0.0.1:8087`、namespaceは`D3E_RECOVERY_20261025`。復旧監査6件を確認した。

| シナリオ | 期待結果 |
|---|---|
| RESERVED中断 | Claim保持、`recoveryRequired=true`、別Run予約拒否 |
| SEND_INTENT_RECORDED中断 | UNKNOWN、PASS/FAILへの上書き拒否 |
| IN_FLIGHT中断 | UNKNOWN、PASS/FAILへの上書き拒否 |
| commit応答喪失 | Claim 1件、readback可能、再予約拒否 |
| Event結果不明 | UNKNOWN保持、read-after-writeだけで自動確定しない |
| TimeTrip復元不明 | Event結果と独立して`RECOVERY_REQUIRED`、後続停止 |

各シナリオは `story902_runs/{runId}/recovery_audits/{recoveryId}`へ追記型のEmulator証跡を作り、`automaticRetryAllowed=false`、`businessExecutionAllowed=false`を確認する。UNKNOWNをPASS/FAILへ変更せず、業務Eventを送信しない。

### 6.3 責任分界

- 復旧判断: STORY-902テスト責任者。
- 環境・TimeTrip確認: DEV環境管理責任者。
- Runner: 状態取得と停止のみ。再送、manual resolution、scope発行を自動実行しない。
- 1人運用でも、元操作と復旧判断は時刻とrecovery IDを分けて記録する。

## 7. DEV接続承認チェックリスト

### 完了済み

- [x] D-3c Environment lock 9/9 PASS
- [x] D-3d guarded composition 7/7 PASS
- [x] 専用Service Account/最小権限案を作成
- [x] 専用collection/path/ID規則を確定候補化
- [x] executionScopeId運用を具体化
- [x] RECOVERY_REQUIREDをEmulatorで訓練
- [x] Event送信、TimeTrip変更、実DEV接続がないことを確認

### 未完了（いずれか未達ならNO-GO）

- [ ] 専用Service Account作成と実行場所の承認
- [ ] custom roleの権限レビュー・IAM承認
- [ ] runtime identity実Inspectorと承認記録Readerの実装・検証
- [ ] collectionをschema/運用台帳へ登録
- [ ] 保持期間、index、バックアップ、削除禁止期間の承認
- [ ] executionScope発行記録の耐久実装と承認者確認
- [ ] 専用fixture世代と初期状態の直前read-only確認
- [ ] project/database/principalを管理プレーンで直前再確認
- [ ] 最初の接続をread-onlyに限定した操作手順の承認
- [ ] Ledger書込みpath・最大件数・停止条件の別承認
- [ ] 実DEV接続に対するユーザーの明示承認

## 8. 次段階への移行条件

未完了チェックを解消後、まずEnvironment lock付きread-only接続だけを別承認で行う。read-only結果がPASSしても書込みは許可しない。Ledger write検証は、専用SA、custom role、scope document、collection台帳、最大書込件数、UNKNOWN時停止手順を再提示して別承認を得る。

## 9. 残課題・リスク

1. custom roleの最小権限は実DEVで未検証。
2. Admin SDKの実principal/project/database取得Inspectorが未実装。
3. 承認記録とscope documentの耐久Repositoryが未実装。
4. Firestore IAMはcollection単位制約ではないため、Repository allowlistと専用主体が不可欠。
5. 業務EventとLedger transactionは原子的にできず、UNKNOWN手動復旧は残る。
6. Emulator訓練は実IAM・ネットワーク・quota・監査ログを証明しない。

## 10. 安全確認

- 実DEV Firestoreへ接続・書込みしていない。
- IAM、Service Account、Cloud Runを変更していない。
- 業務Event送信、TimeTrip変更、API追加を行っていない。
- D-3eファイルをstage/commitしていない。
- push/deployしていない。
