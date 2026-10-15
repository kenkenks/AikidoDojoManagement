# FW-001追加修正：実Firestoreテストの安全性と回収手順

## Current verified status — 2026-10-15

FW-001 DEV candidate verification is complete. The current offline suite is **186/186 PASS**, 0 FAIL, exit 0; git diff --check passed. Earlier test counts below are historical results, not the current total.

- Project: dojo-management-dev; database: (default).
- Candidate: dojo-time-travel-admin-00039-pex. Normal serving revision dojo-time-travel-admin-00024-728 remained at 100%.
- Run: FW001TEST_83f59b07a48f44b1aed1603a9eb8c412.
- Registration, repeat submission and cancellation: all three confirmed and independently verified against Firestore.
- Repeat retained the original IDs and ten-document count. Cancellation retained those IDs, recorded cancellation metadata, kept invoice/View amounts at 1,000 yen and reduced View attendance details to zero.
- All ten dedicated documents were recovered. Final read-only absence check: **2026-10-15 17:03:51 JST**, all ten absent and dedicated scope queries empty.
- Final journal: status: passed; step: 3; verifiedStep: 3; stopped: true; pending: false; lateWritesPossible: false; errors empty. stopped prevents further staged operations after recovery.
- No promotion to normal traffic or Firebase Hosting publication was performed. DEV candidate placement is complete; broader release is outside this verification.
- P001 fee-display mapping, broader load/contention validation and populated-data rollout audits remain separate tasks and do not block this scoped FW-001 verification completion.

The journal and generated browser scripts remain ignored local evidence; do not add them to Git. This status records completed authorization, not permission to repeat live operations. See [verification record](FW-001_VERIFICATION_2026-10-15.md) and [candidate procedure](FW-001_CANDIDATE_TEST_SAFETY.md).


初期導入時の履歴：FW-001 Patch適用済みソース（当時131テストPASS）。対象はテスト基盤のみ。

初期導入時の変更ファイルは次の6件。業務処理・GAS・API・設定ファイルは変更していない。

- work/verify-fw001-firestore-real.cjs（修正）
- work/verify-fw001.cjs（追加オフライン試験の登録のみ）
- work/fw001-firestore-safety.cjs（追加：台帳・監督・所有確認・回収）
- work/fw001-safety-child-fixture.cjs（追加：接続なしの子プロセス試験用）
- work/verify-fw001-firestore-safety.test.cjs（追加：30試験）
- docs/current-work/FW-001_FIRESTORE_TEST_SAFETY.md（本資料）

## 修正の要点

- 親プロセスはSDKをロードせず、検証・回収を別々の子プロセスで監督する。
- SDK通信、検証全体、回収全体、SDK終了処理に期限を設ける。
- 期限到達時は検証子へ停止要求を送り、猶予後も停止しない子だけを終了させる。終了確認前には回収を開始しない。
- 親のprocess.exit()による強制終了をなくす。非同期処理の結果は終了コードと台帳へ記録する。
- 書込送信・transaction.create/setより前に、対象パスをローカル台帳へ同期書込しfsyncする。応答が失われても対象を追跡する。
- 子PIDも開始メッセージ送信前に台帳へ記録する。子のコマンドラインには台帳の絶対パスが入る。
- 回収では所有項目を確認し、読取時のupdateTimeを条件として文書単位で削除する。削除後と最後の再読取で不在を確認する。
- 現在の回収は、全対象の存在・所有条件・更新時刻を事前確認してから削除を開始する。最初の削除失敗・所有不一致・更新競合・通信障害で、そのラウンドの後続削除を停止する。旧仕様の「他の文書の回収を継続」は廃止した。
- 検証・回収・SDK終了がすべて完了し、不確定な書込もない場合だけ、検証をpassedとする。

GAS、FW-001の業務処理、DAO/DTO、API、登録・請求仕様は変更していない。書込をテスト用ラッパーで監視するだけであり、実行する業務処理は既存のまま。

## Direct-SDK CLI scope and candidate distinction

以下の子プロセス・--confirm-writer-stopped付きCLI手順は直接SDKテスト用。candidate B方式では使用せず、FW-001_CANDIDATE_TEST_SAFETY.mdのrecover()手順と状態判定を使用する。

## 保存先のガード

次を満たさなければSDK操作へ進まない。

1. targets/dev-firebase.jsonのruntime=firebase、mode=development、projectIdとconfirmedDevelopmentProjectがdojo-management-dev。
2. 実SDKのapp.options.projectIdとFirestore.projectIdがdojo-management-dev、databaseIdが(default)。
3. 別プロジェクト・別database・エミュレータ・代替エンドポイントを指定する環境変数がない。FIREBASE_CONFIGがある場合も開発projectの明示JSONである。
4. 実行・確認・回収のCLIすべてで--confirm-developmentを明示する。
5. 回収は正しい形式の台帳と--confirm-writer-stoppedを必須とする。

SDK対象チェックは検証と回収の両方に適用する。台帳に書かれた別プロジェクトや対象外文書を信用しない。

## 作成・更新する全文書

P = FW001TEST_ + 32桁UUID（ハイフンなし）。このテスト専用のIDを使い、既存会員は使わない。

| コレクション | 文書・変更 |
|---|---|
| members | P_Mを作成し、この会員の級段・登録元・更新日時を更新 |
| teachers | P_Tを作成 |
| dojos | P_Lを作成 |
| billing_blocks | P_Bを作成 |
| training_slots | P_Sを作成 |
| fees | P_Pを作成 |
| monthly_selections | P_BGと対象月から既存monthlySelectionDocumentIdで作成 |
| invoices | 対象月・P_BG・P_Mを含む既存invoice_idで作成 |
| attendances | テスト用UUIDを含む既存attendance_idで作成し、同じ文書の取消状態を更新 |
| payment_status_views | P_Mと対象月から求めた既存View文書を作成・更新 |

通常は合計10文書。同一送信の再送では増やさず、取消は同一出席文書を更新する。SDK再試行により別の出席ID候補が生じた場合も、候補を全件台帳に記録する。候補には未コミットで実在しない文書も含む。

settings、payments、paymentEvidences、plan_selection_rules、その他の既存マスタは読取のみ。テスト用書込ラッパーは、今回の文書以外への書込、所有項目の変更、確認できない文書の更新を拒否する。

固定マスタはcreate-onlyで作成する。事前に存在する文書やALREADY_EXISTSの衝突は上書き・自動削除しない。コレクション全削除、prefixだけによる一括削除、既存データの復元書込は行わない。

## 台帳

初期出力FW001_JOURNALのjournalに絶対パスを表示する。標準保存先：

```text
work/fw001-firestore-runs/FW001TEST_<32桁UUID>.json
```

主な内容：projectId、databaseId、prefix、専用ID、対象月、文書パス、送信前/応答済み/不確定/衝突状態、実行・回収の結果、エラーコード、子PID履歴、検証日時、lateWritesPossible。

認証トークンや既存会員データは台帳に保存しない。台帳保存に失敗した場合は該当書込を送らない。既存台帳を新規実行で再利用・上書きしない。

## 接続なしの検証

```powershell
node work/verify-fw001.cjs
```

初期導入時の履歴：既存131件＋追加30件＝161件（現在は186件）。追加試験はメモリDBとローカル子プロセスを用い、Firestore SDK・認証・エミュレータ・外部通信は使わない。

追加試験だけを実行する場合：

```powershell
node --test work/verify-fw001-firestore-safety.test.cjs
```

SDK接続先不一致、応答喪失、台帳書込失敗、既存文書衝突、所有不一致、条件付き削除失敗、通信無応答、途中作成失敗、コミット応答喪失、SDK終了停止、子の強制停止、停止協力、PID未回収、期限後の成功メッセージ拒否、残存・不確定状態、全文書回収を検証する。

## 実Firestoreを使う場合の実行手順

今回の修正作業では以下の接続・書込コマンドは実行していない。利用者がレビュー後、認証済み開発環境で実行する。

1. FW-001追加Patchを適用し、上のオフライン161件を確認する。既存のFirebaseビルドと依存パッケージが必要。
2. 別project・database・エミュレータ・代替endpointを指す環境変数がないことを確認する。拒否された場合、拒否理由を確認し、チェックを削除して実行しない。
3. 読取だけを試す。

```powershell
node work/verify-fw001-firestore-real.cjs --confirm-development --probe
```

読取確認とSDK終了まで通ればprobe_passed。これは出席登録の成功ではない。Firestoreへのデータ作成・変更・削除は行わない。

4. 実登録・再送・取消を試す場合：

```powershell
node work/verify-fw001-firestore-real.cjs --confirm-development
```

専用の10文書を作成・更新し、別の子プロセスで回収する。FW001_JOURNALのパスと最後のFW001_RESULTを保存する。台帳とログは、後続の残存確認まで削除しない。

既定の期限：検証全体30秒、回収全体30秒、外部操作（transaction全体を含む）10秒、停止猶予1.5秒。猶予後に子の終了確認も最大1.5秒待つ。SDK終了処理も各1.5秒。検証と回収は順次なので総時間は30秒に限定されない。

遅い環境で明示的に延ばす例（無期限にはならない）：

```powershell
node work/verify-fw001-firestore-real.cjs --confirm-development --timeout-ms 120000 --cleanup-timeout-ms 120000 --rpc-timeout-ms 20000
```

各指定は100～300000ミリ秒。Ctrl+C/SIGTERMは検証子へ停止を要求し、回収を試みる。回収中も規定期限を設ける。OSの強制終了・電源断はこの処理を保証できない。

## タイムアウト・異常終了時の確認と回収

### 1. 台帳を確保し、書込子の停止を確認

FW001_JOURNALで表示されたファイルを指定する。

```powershell
$fw001Journal = 'C:\実際のリポジトリ\work\fw001-firestore-runs\FW001TEST_実際のUUID.json'
$fw001State = Get-Content -Raw -LiteralPath $fw001Journal | ConvertFrom-Json
$fw001State | Select-Object status, prefix, projectId, databaseId, lateWritesPossible
$fw001State.workers | Format-Table pid, mode, startedAt
$fw001State.documents | ConvertTo-Json -Depth 8
```

親が強制終了した場合、子が残ることがある。子はIPC切断時に新しい処理を止めるが、進行中RPCやOS資源の終了までは保証しない。PIDは再利用されるため、番号だけで別プロセスを停止しない。

Windowsで、この台帳名を持つ子だけを読み取り確認する例：

```powershell
$fw001JournalName = Split-Path -Leaf $fw001Journal
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like "*verify-fw001-firestore-real.cjs*--worker*$fw001JournalName*" } |
  Select-Object ProcessId, CommandLine
```

書込子が残っている場合は、同じ台帳パスと子PIDを確認してその子を停止する。まだ書込子が動いている状態で回収しない。writer_not_reapedの場合、プログラムも自動回収を開始しない。

### 2. 読取だけで残存を調べる

```powershell
node work/verify-fw001-firestore-real.cjs --confirm-development --inspect --journal $fw001Journal
```

確認・回収するのは、台帳の対象文書だけ。別のコレクションやprefix一致文書を広く削除しない。

### 3. 書込子停止を確認後、同じ台帳で回収

```powershell
node work/verify-fw001-firestore-real.cjs --confirm-development --recover --confirm-writer-stopped --journal $fw001Journal
```

今回の専用ID・所有項目と一致する文書だけ、updateTime条件付きで削除して再読取する。既に不在の文書は安全に再確認でき、途中失敗しても同じ台帳で再実行できる。照合に失敗した文書は自動削除しない。

### 4. 後続の不在確認

通信回復・子停止・未完了RPCの状況を確認した後、--inspectを再実行する。verifiedAtと文書別状態を保存する。固定の待ち時間だけで、遅延コミットが絶対にないとは断定できない。

| 状態 | 対応 |
|---|---|
| absent / deleted_verified | 表示された確認日時には不在。lateWritesPossibleがあれば後続確認も必要 |
| present_owned | 今回の専用データが存在。書込子停止後に--recover |
| unknown_or_failed / verification_unknown / not_verified | 未確認。errorsの対象パス・操作・コードを確認し、通信・権限回復後に再確認・回収 |
| owner_mismatch_not_deleted / collision_not_deleted | 自動削除しない。対象の所有と作成経緯を手動調査 |
| still_present / reappeared | 残存または再出現。書込子・遅延コミットを再調査し、後続回収 |

## 終了コード

- 0：通常実行なら全検証・回収完了かつ不確定書込なし。probeは読取確認完了。inspect/recoverはその確認結果のみで、元テストの失敗を成功に変更しない。
- 1：検証失敗・割込・設定拒否等。または、全件不在を確認してもlateWritesPossibleが残る場合。
- 2：検証子の全体タイムアウト（回収は完了しても検証成功ではない）。
- 3：回収・確認の失敗または期限切れ、書込子の終了未確認、残存データ等。

回収後に全件不在でも、遅延書込の可能性がある場合はrecovery_verified_remote_uncertain・終了コード1を維持する。不確定フラグを手動で消して成功扱いにしない。

## 削除保証の限界と台帳がない場合

ネットワーク切断後にサーバー側だけで書込が確定すること、親子両方の強制終了、電源断、ディスク障害、権限の取り消しなどに対し、完全な削除保証はできない。fsync済み台帳も、ハードウェア障害や保存媒体喪失まで保証しない。SDKのPromiseの期限はリモート操作の取消保証ではない。

このため不確定状態を失敗として残し、台帳から後で確認・回収できるようにしている。台帳を紛失した場合は自動回収を行わず、保存したFW001_JOURNALのrun/prefixから上記10種類の対象をFirebase Console等で手動調査する。出席・請求は専用member_id、月次選択は専用billing_group_id、Viewは専用member_idと対象月で照合する。所有を確定できない文書は削除しない。

## Current cleanup safety contract

The shared inspectOrCleanup implementation checks every journaled path before the first delete: allowed identity, attempted/noncollision entry, existence, ownership and updateTime for present documents. Any preflight failure blocks all deletes. Already absent paths are permitted so a partial cleanup can be inspected safely; the completed live run separately required all ten present before recovery.

Each deletion re-reads ownership and supplies lastUpdateTime from that snapshot. The first failed/uncertain delete, ownership mismatch, changed version, read failure or still-present result stops subsequent deletes in that round. States distinguish deleted_verified, absent, unknown_or_failed, owner_mismatch_not_deleted, still_present and not_processed; preflight_failed blocks dispatch. Uncertain outcomes never count as success. Journal-save failure also prevents subsequent deletes by propagating the error.

Candidate recover returns cleanup_incomplete on an incomplete round; it does not automatically repeat failed deletions. Successful rounds retain waiting, dedicated-scope rediscovery and final absence verification; reappearance or failed verification cannot become PASS. A finite observation window cannot prove that no arbitrarily late commit will ever occur. Additional recovery after an error requires separate approval.

The latest offline suite includes normal ten-document cleanup, all-owner preflight, first-delete failure, partial cleanup followed by update conflict or lost response, bounded communication failures, and reappearance tests: 186/186 PASS.
