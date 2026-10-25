# STORY-902 B-3 TimeTrip Controller・実行直前ゲート

## 結論

B-1のManifest検証とB-2の継続判定を変更せず再利用し、TimeTrip操作直前のfail-closedゲートと依存注入型Controllerを追加した。B-3はTimeTrip準備の可否だけを扱い、`businessExecutionAllowed`は常に`false`である。実API、Firestore、TimeTripへの接続は行っていない。

## 実行直前ゲート

`work/story902-pre-execution-gate.cjs`は次をすべて明示確認できた場合のみ`timeTripOperationAllowed=true`を返す。

1. Manifest全体が正常
2. B-2が対象イベントを継続候補と判定
3. STORY-902 Run IDが有効
4. B-2結果の出所が検証済みで、現在のRun IDと一致
5. `dojo-management-dev` / `dev-firebase`が検証済み
6. 認証・認可が検証済み
7. fixtureの整合性が検証済み
8. イベント実行日時が確定済み
9. TimeTrip対象が`dojo-management-dev` / `dev-firebase`と一致

未確認値はPASSにしない。理由はコード付き配列で返す。B-2の`eventResults`自体にはRun IDがないため、`runContext.resultSource`を後工程のRun Ledgerが発行・検証する前提とした。過去結果を現在Runへ流用してはならない。

## Controllerと状態遷移

`work/story902-time-trip-controller.cjs`は`read`、`set`、`restore`を持つAdapterだけを受け取る。

`NOT_PREPARED -> PREPARED -> TIME_SET -> VERIFIED -> RESTORED`

- `prepare`: ゲート確認後、現設定をbaselineとして読み取る。
- `set`: 確定日時・対象月をAdapterへ渡す。
- `verify`: 再読取値のenabled、now、target_monthを照合する。
- `prepare`はRun ID、eventId、DEV対象、日時・対象月をController境界でも再検証し、改変されたゲートをAdapter呼出前に拒否する。
- baselineは既存GET契約の`ok`、`enabled`、`now`、`target_month`を検証し、安全な復元payloadへ正規化する。不正値では`PREPARE_FAILED`となる。
- `restore`: baselineをAdapterへ渡し、再読取結果がbaselineと一致した場合だけ`RESTORED`にする。set/verify失敗後も呼出可能。
- 失敗状態は診断可能な`*_FAILED`とし、業務実行は許可しない。

## 既存TimeTrip契約の調査結果

保留ブランチ上の既存E010 Controller、`cloud/time-travel/admin-server.cjs`、`cloud/api/admin-api.cjs`を読み取り確認した。

- 既存入口: `/api/system/admin/time-travel`
- 読取: 認証付きGET
- 設定・復元: 認証付きPOST
- 設定payload: `enabled`、`now`、`target_month`
- 読戻しの主項目: `ok`、`enabled`、`now`、`target_month`、`effective.time_travel_enabled`、`effective.target_month`
- 認証: 既存Firebase ID tokenと既存管理者認可
- DEVの既存ブラウザ経路: `firebase_auth.js`と`dojo_api_client.js`

B-3はこのURLや認証クライアントを実装へ直結していない。後工程で、既存契約を呼ぶDEV限定Adapterを注入する。

## テスト

`node work/verify-story902-pre-execution-time-trip.cjs`

- E010候補、未確定46件遮断
- Run ID、結果出所、DEV、認可、fixture、日時、TimeTrip対象の各遮断
- set/verify成功、set失敗、verify不一致、restore成功・失敗
- 不正Manifest遮断
- 全経路で`businessExecutionAllowed=false`
- 実ネットワーク/Firebaseクライアント非依存

結果はB-1 `13/13`、B-2 `15/15`、B-3 `25/25`、既存全回帰 `225/225` PASS。`git diff --check`もPASSした。

既存B-1、B-2および関連回帰も再実行する。

## 次工程への引継ぎ

- 永続Run LedgerでRun ID、Manifest fingerprint、結果の出所を署名可能な証跡として確定する。
- DEV限定Adapterを既存認証・既存TimeTrip APIへ接続する。
- set後のUNKNOWN、restore失敗、途中終了からの復旧規約を耐久Ledgerに記録する。
- `VERIFIED`後も、業務Adapter用の別ゲートが成立するまで業務イベントを送信しない。
- Controllerは単一プロセス内の状態機械であり、再開・排他・耐久性は未実装。
