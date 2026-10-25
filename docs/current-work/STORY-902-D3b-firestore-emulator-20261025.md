# STORY-902 D-3b Firestore Emulator統合検証

作成日: 2026-10-25

基準: `main` / `78ea539`

範囲: Firestore Emulator上のRepository統合検証。実DEV Firestore、業務Event、TimeTripには接続・変更していない。

## 1. 結論

D-3a RepositoryをFirestore Emulatorへ接続し、14シナリオで指示された17検証観点を確認した。全14シナリオがPASSした。同一Claimの初回予約・重複拒否、同時3 Runner、Repository再生成、別Nodeプロセス、Firestore transaction競合、commit応答喪失相当で安定Claimが維持された。

Emulator結果は`EMULATOR_ONLY`としてD-2モデルへ追加し、`projectContinuationResult()`から実DEVの継続PASSへ投影できないようにした。Mock、Emulator、DEV Liveの証跡は区別される。

## 2. 追加・変更ファイル

| ファイル | 内容 |
|---|---|
| `work/firebase-emulator-story902-d3b.json` | localhost:8087、demo project用Emulator設定 |
| `work/verify-story902-firestore-run-ledger-emulator.cjs` | Admin SDKを使うEmulator統合テスト |
| `work/story902-run-ledger-model.cjs` | `EMULATOR_ONLY`証跡追加と実DEV投影拒否 |
| `work/story902-run-ledger-firestore-repository.cjs` | 注入Repositoryが要求する証跡種別をDEV Live/Emulatorから選べる最小拡張 |
| `work/verify-story902-firestore-run-ledger.cjs` | Repository証跡エラーコード変更への追従 |
| `docs/current-work/STORY-902-D3b-firestore-emulator-20261025.md` | 本記録 |

既存API endpoint、業務DAO/DTO、業務状態遷移は変更していない。

## 3. Emulator起動方法

PowerShellで次の安全値を明示して実行した。

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8087'
$env:GCLOUD_PROJECT='demo-story902-d3b-emulator'
$env:GOOGLE_CLOUD_PROJECT='demo-story902-d3b-emulator'
firebase emulators:exec --only firestore `
  --config work/firebase-emulator-story902-d3b.json `
  --project demo-story902-d3b-emulator `
  "node work/verify-story902-firestore-run-ledger-emulator.cjs"
```

使用環境:

- Firebase CLI: 15.22.3
- Emulator host: `127.0.0.1:8087`
- Emulator project: `demo-story902-d3b-emulator`
- Test namespace: `D3B_EMULATOR_20261025`
- Firestore rules: `work/firestore-emulator-deny-all.rules`
- UI: disabled
- singleProjectMode: true

Admin SDKは`initializeApp({projectId: demo project})`だけで初期化し、実DEV credentialを渡していない。

## 4. 接続先の安全確認

検証スクリプトは処理開始前に次をfail-closedで検証する。

1. `FIRESTORE_EMULATOR_HOST`が完全一致で`127.0.0.1:8087`。
2. host形式がloopback IPv4である。
3. `GCLOUD_PROJECT`または`GOOGLE_CLOUD_PROJECT`が`demo-story902-d3b-emulator`。
4. 両project環境変数が存在する場合は一致する。
5. project IDが`demo-`で始まる。

条件不一致時はFirebase app作成より前に停止する。対象業務環境を表すLedger内`projectId=dojo-management-dev`と、保存先のEmulator projectを分離している。保存先はdemo project、実行対象はDEV契約であり、実DEV Firestoreへは接続していない。

## 5. テストケースと結果

Emulator統合: 14/14 PASS。統合した1シナリオ内で複数の必須観点を検証している。

| # | シナリオ | 結果 | 必須観点 |
|---|---|---|---|
| 1 | Claim初回取得 | PASS | 初回Claim成功 |
| 2 | 同一Claim、別Run、別request | PASS | 重複、Run ID、request ID変更拒否 |
| 3 | fixture fingerprint変更 | PASS | fixture変更拒否 |
| 4 | 同時3 Runner | PASS | 成功1・競合2、transaction原子性 |
| 5 | RESERVED中断 | PASS | Claim保持、再予約拒否 |
| 6 | SEND_INTENT_RECORDED中断 | PASS | UNKNOWN化 |
| 7 | IN_FLIGHT中断 | PASS | UNKNOWN化 |
| 8 | terminal state全4種 | PASS | PASS/FAIL/BLOCKED/UNKNOWN上書き禁止 |
| 9 | Repository再生成 | PASS | 永続Claim保持 |
| 10 | 別Nodeプロセス | PASS | processを跨いだ重複拒否 |
| 11 | Event/TimeTrip分離 | PASS | FAILを保持したままRESTOREDへ更新 |
| 12 | 証跡分離 | PASS | Mock拒否、EMULATOR_ONLYの実DEV投影拒否 |
| 13 | transaction失敗 | PASS | record 0件、安全停止 |
| 14 | commit応答喪失相当 | PASS | UNKNOWN停止、Claim 1件、再予約拒否 |

検証終了時点の専用demo project内件数はClaim 16件、Run 16件だった。Emulator終了時にプロセス内データは破棄され、実DEVには残らない。

## 6. 競合・再起動・障害試験

### 同時Runner

独立Repositoryインスタンス3件から同一Claimへ同時`reserve()`した。Firestore transactionの競合再試行後、成功1件、拒否2件、Claim document 1件だった。

### Repository再生成・別プロセス

同一Firestore connectionからRepositoryを再生成してもClaimを取得でき、再予約は拒否された。別Node processは独自Firebase app/Repositoryで同じClaimを予約し、`EVENT_CLAIM_ALREADY_EXISTS`になった。

### Transaction失敗

Firestore-like clientの`runTransaction`をcommit前に失敗させた。Claimは0件で、Repositoryは成功を返さなかった。

### commit応答喪失相当

実Emulator transactionをcommitした直後、wrapperが`outcomeUnknown=true`を送出した。Repositoryはreadback後も成功扱いせず`REPOSITORY_OUTCOME_UNKNOWN`で停止した。Claimは1件だけ存在し、別Runの再予約は拒否された。

## 7. D-3aとの互換性

- Repositoryの操作名、安定Claim key、version条件更新、terminal不変性は変更していない。
- D-2純粋モデルを状態遷移の唯一の判定元としている。
- D-3a既定値は`DEV_LIVE`のままである。
- EmulatorではRepository生成時に`evidenceKind=EMULATOR_ONLY`を明示する。
- `MOCK_ONLY`はD-3a/D-3b Repositoryのいずれにも保存できない。
- `EMULATOR_ONLY`はB-2継続用の実DEV結果に投影できない。
- 全recordは`businessExecutionAllowed=false`である。

## 8. 回帰結果

- D-3b Emulator: 14/14 PASS
- D-3a Offline Repository: 20/20 PASS
- D-2 Run Ledger: 18/18 PASS
- B-1 Manifest Loader: 13/13 PASS
- B-2 Continuation Gate: 15/15 PASS
- B-3 Pre-execution / TimeTrip: 25/25 PASS
- C-2 Business Adapter: 23/23 PASS
- 既存回帰: 225/225 PASS
- B-1〜C-2＋既存回帰: 301/301 PASS
- 構文チェック: PASS
- `git diff --check`: PASS

## 9. D-3cへの引継ぎ

1. 実DEV接続前に、Ledger collection名、保存期間、schema台帳を承認する。
2. `executionScopeId`の発行・再試験承認手順を確定する。
3. 信頼されたRunnerの実行場所とAdmin SDK principal、最小IAM権限を確定する。
4. Environment lock、TimeTrip baseline/restoreの耐久保存を実装・Emulator検証する。
5. SDKのdeadline/unavailable/ABORTEDをRepository reason codeへ正規化する。
6. 実DEVでは最初にread-only接続確認を行い、書込みは別承認とする。
7. Business Adapterへの送信能力付与は、Ledger/TimeTrip/readbackを統合した後の別工程とする。

## 10. 未解決事項・リスク

- Emulatorは実IAM、実ネットワーク、実Firestore quota/index挙動を証明しない。
- Admin SDKはSecurity Rulesを迂回するため、deny-all rulesでも実行主体のIAM設計が必要。
- 実Firestoreのcommit応答喪失を意図的に再現したものではなく、Emulator commit後wrapperで同等のRepository境界を検証した。
- transactionと業務Event送信は原子的にできず、UNKNOWNの手動resolution方針が引き続き必要。
- `executionScopeId`の誤発行は再実行防止を迂回し得る。
- Emulator起動によりリポジトリ直下の既存`firestore-debug.log`が更新され得る。これは検証ログであり、成果物へ含めない。

## 11. 安全確認

- 実DEV Firestoreへ接続・書込みしていない。
- 実Event送信、TimeTrip変更を行っていない。
- 新しいAPI endpoint、業務DAO/DTOを追加・変更していない。
- Emulator証跡を実DEV PASSへ昇格していない。
- D-3bのstage、commit、push、deployは実施していない。
