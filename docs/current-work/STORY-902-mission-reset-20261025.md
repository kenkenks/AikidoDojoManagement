# STORY-902 ミッション再整理

作成日: 2026-10-25

基準: `main` / `7346da8`

調査範囲: Excel原本「902イベント」2〜48行、STORY-902一か月試験運用、設計検討記録、既存GAS月次Runner、工程A、B-1〜C-2、D-1〜D-3f。コード・Excel・環境は変更していない。

## 1. STORY-902本来の目的

STORY-902の中心目的は、2027年7月の47業務イベントを仮想日時順に実行し、実際の画面操作に相当する要求を既存WebConnectへ渡し、出席・会費受付・取消・重複操作・月末集計が一連の業務として整合することを確認することである。

単体APIを47回ばらばらに確認することや、業務Service/DAOを直接呼ぶことが目的ではない。イベント定義と実行エンジンを分離し、既存の業務ロジックをWebConnect境界から利用する。

Excel原本の47件は次の構成だった。

| 種別 | 件数 |
|---|---:|
| 出席登録 | 26 |
| 現金受付 | 13 |
| PayPay受付 | 1 |
| 審査費受付 | 1 |
| 出席取消 | 1 |
| 支払取消 | 1 |
| 現金再送 | 1 |
| PayPay再送 | 1 |
| PayPay二重払い | 1 |
| 月末検証 | 1 |

対象会員はM001、M002、M005-1〜3、M006、M007、料金プランはP001、P002、P011、P020、P021、追加料金はEXAM-TESTである。原本自体には多くのaction、payload、期待HTTP、実行時刻、依存関係が「要確認」「未確定」と明記されている。

## 2. 当初の受入条件

原本・関連Storyから直接読み取れる受入条件は次のとおり。

1. 47イベントを固定Event IDで管理し、仮想日時順に処理できる。
2. 業務操作は原則として既存WebConnectを使用し、Runnerへ業務計算を複製しない。
3. 専用テストPersona/データを使い、既存業務データと衝突させない。
4. 出席、現金、PayPay、家族料金、審査費、取消、重複、月額上限を検証できる。
5. 各イベントで入力、応答、期待DB/画面状態、Actual、判定、生成レコードを追跡できる。
6. 月末に出席・請求・入金・未払い・取消の整合性を説明できる。
7. 同一Scenarioの再実行で二重登録せず、異常時に対象Eventと差異を特定できる。
8. 専用データだけを識別・消去でき、通常データを削除しない。
9. コアRunner通過後、代表操作だけを画面スモークで確認する。

### 原本間の差異

- 2026年作成の「一か月試験運用」は高速インメモリRunner、`ctx.settings`内の仮想時刻、翌月初日の非混入確認を受入条件に含む。
- 2026-10-22の「設計検討記録」とExcelは、2027年7月、WebConnectイベント駆動Runnerを最終方針としている。
- Excelの47件は7月31日のE470で終わり、翌月初日Eventを含まない。

したがって、新Runnerの正本はExcel 47件＋設計検討記録とする。翌月初日の非混入を47件Runnerの必須Eventへ追加するか、既存月次Runnerの回帰へ残すかは仕様確認事項であり、独断で48件目を追加しない。

## 3. 現在の達成状況

### 3.1 完了済み

| 項目 | 状態 | 根拠 |
|---|---|---|
| Excel 47件のManifest化 | 完了 | `work/story902-event-manifest.json`、47件、ID重複なし |
| Manifest静的検証 | 完了 | B-1。Schema、日付、依存、循環、fail-closed |
| 依存結果モデル | 完了 | B-2。PASS/FAIL/BLOCKED/UNKNOWNと継続判定 |
| TimeTrip制御の純粋Controller | 完了 | B-3。prepare/set/verify/restore、Mock検証 |
| E010契約調査 | 完了 | C-1。既存`attendance_batch`契約とExpected対応 |
| E010 Business Adapter | Mock完了 | C-2。23/23、実業務ロジック非複製 |
| E010 Expected | 完了 | 出席1、取消0、課金1、請求1,500円 |
| E010個別検証 | 過去PASS | Manifest上の個別実績。47件一括PASSではない |
| Run結果・重複防止モデル | 完了 | D-1/D-2。Claim、状態、UNKNOWN、証跡分離 |
| Firestore Repository | Emulator完了 | D-3a/b。原子的Claim、競合、永続性 |
| 復旧訓練 | Emulator完了 | D-3e。6/6、UNKNOWN自動再送なし |

Manifestの仕様状態は、実行可能1件、暫定30件、未確定16件である。実装済みはE010だけで、47件一括Runnerは未実装・未実行である。

### 3.2 未完了の受入条件

1. E020〜E470のpayload、実行時刻、期待応答、期待DB状態、確定依存関係。
2. 出席以外のEvent family Adapter。現金、PayPay、審査費、出席取消、支払取消、再送、二重払い、月末Judge。
3. 47イベントを日時順に進める共通Runner本体。
4. Loader、TimeTrip、Adapter、Judge、結果記録をつなぐ実行composition。
5. M002、家族、ビジター、体験、審査費等の専用fixtureと初期状態。
6. Event別Actual/Expected/Judgeと、月末E470の総合整合性。
7. 中断後の再開、依存EventのBLOCKED伝播、全体サマリ。
8. 47件のMock/Emulator回帰、承認されたDEV実行、代表画面スモーク。
9. 専用業務データの安全なcleanupと残存確認。

## 4. 責務の再分類

### A: STORY-902の必須機能

- Excel由来47イベントManifestと仕様補完記録。
- 時系列・依存関係に基づく共通Runner。
- 既存WebConnectを呼ぶEvent family Adapter。
- TimeTripによるEvent日時設定と読戻し。
- fixture準備、Expected/Actual/Judge、月末総合検証。
- Run/Eventトレース、生成レコード対応、二重実行防止、UNKNOWN停止。
- 専用データcleanup、47件サマリ、代表画面スモーク。

D工程のうち、安定Claim、結果状態、実行証跡、重複防止、UNKNOWN保持は、当初の再実行性・追跡性へ直接必要なのでAとして利用する。ただし全機能の高度化を完了条件にはしない。

### B: 共通基盤として利用する機能

- 既存WebConnect dispatch、認証済みTransport、DAO/DTO。
- 既存Firestore SDK初期化・Repository境界。
- 既存TimeTrip APIとB-3 Controller。
- B-1 Loader、B-2継続判定。
- D-2/D-3a/bのRun Ledgerモデル、Repository、Emulatorテスト。
- 既存GAS `12_MonthlyPilotRunner.js`、`13_MonthlyIntegrationRunner.js`の月次検証観点。
- 既存STORY-902進捗ビュー。

これらは再利用するが、既存の業務コードやDAOを新Runner専用に改変しない。

### C: 別タスクへ移管する機能

- STORY-902専用Service Accountの新設。
- custom IAM role、最小権限監査、IAMロールバック運用。
- Cloud Run実行主体の分離・Job化。
- 汎用Environment lock製品化、runtime identity実Inspector。
- 耐久承認記録Reader、権限監査UI。
- すべての環境へ適用する高度なセキュリティ標準化。

D-3c〜D-3fのコード・文書は維持し、別タスクの入力にする。既存Environment lockや安全ゲートを無効化しない。ただし専用SA/custom roleの完成をSTORY-902受入条件にはしない。既存DEV認証・承認・接続手順で実施可能な検証を妨げない。

## 5. ミッション外へ拡大した項目

D-1/D-2の基本Ledgerは原本のRun ID、追跡、再実行性に沿う。一方、D-3c以降で扱った専用SA、custom role、Cloud Run分離、実identity Inspector、IAM監査、承認基盤は、安全性向上には有用だがExcel 47件や当初受入条件には存在しない。

これらを削除しない。STORY-902 Runnerから必須依存として強制せず、共通セキュリティ・DEV実行基盤タスクへ移管する。既に完成したオフライン安全テストは回帰として保持する。

## 6. 最短の残工程

残工程を3つにまとめる。

### 工程1: 47件仕様確定とEvent family Adapter

**目的**: 46件の未確定仕様を、イベント1件ずつではなく業務種別単位で解消する。

**実装対象**:

- 出席登録AdapterをE010専用から26件共通へ一般化。
- 現金、PayPay、審査費、取消、再送/二重払い、月末read-only Judgeの契約確定とAdapter。
- 同日Eventの時刻・順序、fixture mapping、Expected、確定依存をManifest補完メタデータへ反映。

**完了条件**:

- 47件すべてに確定executionDateTime、payload、Expected、依存関係、Adapterがある。
- 仕様上未実装の操作は削除せず、期待するBLOCKED/拒否を定義する。
- 全AdapterをMockで検証し、業務Service/DAOを直接呼ばない。

**必要テスト**: family別正常・拒否・重複・UNKNOWN、Manifest 47件静的検証、既存WebConnect契約回帰。

**接続点**: B-1/B-2、C-2、既存WebConnect。

**外部影響**: ローカルMock段階はなし。read-onlyマスタ確認が必要な場合は既存DEV承認手順を使う。

### 工程2: 共通Runner統合

**目的**: 47件を日時順に連続実行し、失敗しても依存しない後続を継続できるRunnerを作る。

**実装対象**:

- Manifest Loader → dependency gate → TimeTrip → Adapter → Judge → Ledger → progress summaryのcomposition。
- PASS/FAIL/BLOCKED/UNKNOWN継続規則、中断・再開、全体サマリ。
- 既存Run Ledgerの必要部分だけを接続。高度なIAM機能をRunner要件へ持ち込まない。

**完了条件**:

- Mock/Emulatorで47件が最後まで判定される。
- Event送信前に実行意図を記録し、UNKNOWNを自動再送しない。
- TimeTrip設定・読戻し・最終復元を証跡化する。
- E010の過去PASSと今回Runを混同しない。

**必要テスト**: 全47件順序、依存伝播、独立Event継続、中断再開、TimeTrip不一致停止、重複防止、総合サマリ。

**接続点**: B-1〜B-3、C family adapters、D Ledger、既存TimeTrip/WebConnect。

**外部影響**: Mock/Emulatorなし。DEV実行は別承認でTimeTrip・業務データを変更する。

### 工程3: 統合受入検証

**目的**: 専用fixtureで47件を実際のWebConnect経路へ流し、月末整合性と代表画面を確認する。

**実装対象**: 新機能ではなく、Preflight、fixture、実行、E470総合Judge、cleanup、画面スモーク、結果文書。

**完了条件**:

- 47件がPASS/FAIL/BLOCKED/UNKNOWNで説明可能に完走する。
- E470で出席・請求・現金・PayPay・審査費・取消・未払いが期待値と一致する。
- 同一Scenario再実行で二重登録しない。
- TimeTripを基準値へ復元し、専用データだけをcleanupできる。
- 原本で必要な代表画面スモークを完了する。
- 翌月非混入を47件外の既存回帰で扱うか、追加受入とするかを記録する。

**必要テスト**: Preflight、既存DEV認証、47件統合、E470、再実行、cleanup、画面スモーク。

**接続点**: 既存DEV WebConnect、TimeTrip、Firestore/GASテストデータ、進捗ビュー。

**外部影響**: DEVのTimeTripと専用業務データを変更するため、既存の個別承認と復元手順が必要。本番への影響なし。

## 7. 次に実装すべき最小単位

次は工程1のうち、**出席登録Event familyの共通化**へ進む。

具体的には、C-2のE010 Adapterを26件の`ATTENDANCE_REGISTER`へ一般化する前に、E020/E030/E070/E080を代表として次を確定する。

1. 稽古時刻と同日順序の共通補完規則。
2. M002、家族、ビジター、体験のfixture mapping。
3. P001/P011/P020/P021のread-onlyマスタ実値。
4. `attendance_batch` payloadと成功/拒否Expected。
5. 月払い・家族・無料系での請求/課金Expected。

この4代表で契約を確定後、同じAdapterを残りの通常出席Eventへ展開する。E020専用HTMLやEvent別APIは作らない。

## 8. 判断事項

- Excelにない翌月初日Eventを47件へ追加するかは未確定。現時点では追加しない。
- 支払取消と審査費に既存WebConnect契約がなければ、STORY-902内で新APIを即作成せず、期待BLOCKEDとして記録するか別業務タスクへ分離する判断が必要。
- 原本初期値と現在のDEV料金マスタが異なる場合、原本を変更せず補完メタデータと期待値根拠を記録する。

## 9. 安全確認

- Excel原本、Manifest、既存コードを変更していない。
- D-1〜D-3fを削除・改変していない。
- IAM、SA、Firestore、TimeTrip、Event、DEV環境を変更していない。
- 本文書のみを作成し、stage/commit/push/deployしていない。
