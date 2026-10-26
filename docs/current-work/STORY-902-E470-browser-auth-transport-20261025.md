# STORY-902 第4段階：既存ブラウザ認証との接続

作成日: 2026-10-25
作業区分: ローカル実装・モック検証のみ

## 結論

既存Firebase Hosting画面の認証済みsessionから、既存 `dojo_api_client.js` を使って `attendance_progress_summary` をGETし、HTTP応答をE470共通DTO・Judgeへ直接渡す最小Transportを実装した。

tokenは `dojoApiClient` 内だけで扱われる。新しいコードは `getIdToken()`、Authorization header、Firebase user/uidを参照・返却・保存・ログ出力しない。

Node専用ファイルI/O・Transportと、ブラウザでも使える純粋なDTO変換・Judgeを分離した。API、認証機構、Cloud Run、Firestore、GASは変更していない。

## 変更ファイル

### 新規

- `web/qr/story902_e470_common.js`
  - Node/ブラウザ共通の純粋な入力検証、DTO変換、`UNSUPPORTED`、Judge。
  - 単一会員の `attendance_progress_summary` 応答からE470結果DTOを構築する。
- `web/qr/story902_e470_browser_transport.js`
  - Firebase DEV・通常URL・GET・`attendance_progress_summary`専用Transport。
  - 既存 `authClient.ready/getCurrentUser` と `apiClient.request` のみ利用する。
- `work/verify-story902-e470-browser-transport.cjs`
  - ブラウザTransportと共通判定のモックテスト6件。

### 変更

- `work/story902-e470-webconnect.cjs`
  - 純粋なDTO・Judge処理を共通モジュールからimport。
  - Node側Adapter、GAS/Firebase複合read、ローカル結果保存は従来どおり維持。
- `web/qr/attendance_summary.html`
  - 新規2スクリプトを読込。
  - DEV Firebaseでのみ、認証済み既存clientを閉包する `window.DOJO_STORY902_E470_SESSION.runAttendanceProgress()` を公開。
  - UI、通常の出席進捗表示、GAS JSONP経路は変更しない。

## 実装構成

```text
attendance_summary.html
  ├─ firebase_auth.js          既存session/currentUser
  ├─ dojo_api_client.js        既存Bearer付与・401時1回更新
  ├─ story902_e470_browser_transport.js
  │    └─ GET attendance_progress_summary（通常URL固定）
  └─ story902_e470_common.js
       ├─ attendance_by_date → 対象月分
       ├─ Actual DTO
       └─ Expected比較 → PASS / FAIL / PARTIAL
```

ブラウザ公開面は `runAttendanceProgress` 1関数のみ。auth client、api client、token、headersは公開オブジェクトへ含めない。

## 安全条件

Transport生成時:

- `runtimeConfig.target === 'dev-firebase'`
- `runtimeConfig.runtime === 'firebase'`
- `runtimeConfig.firebase.projectId === 'dojo-management-dev'`
- `runtimeConfig.apiBaseUrl` が通常URLと完全一致
- `candidate---` URLを拒否

実行時:

- actionはコード内で `attendance_progress_summary` に固定
- methodは `GET` に固定
- URL parameterは `action` と `member_id` のみ
- `reception_scopes` は空配列だけを許可
- 単一memberだけを許可
- 認証user不在ならrequest前に停止
- HTTP 200以外はJudgeを生成しない
- 応答member_id不一致は停止
- POST、TimeTrip、fixture、write actionへの汎用入口を持たない

## 共通DTO接続

ブラウザTransportのsanitized response:

```json
{
  "action": "attendance_progress_summary",
  "method": "GET",
  "http_status": 200,
  "body": { "ok": true, "member_id": "...", "attendance_by_date": [] }
}
```

この値は外部ファイルへ保存せず、同一ブラウザ処理内で `createAttendanceProgressResult()` へ渡される。戻り値はNode版と同じE470結果構造:

- `input`
- `expected`
- `actual.attendance.members`
- `judge`
- `calls`

今回呼ばない会費・月次請求項目は0ではなく `UNSUPPORTED` とする。

## テスト結果

### 新規・関連・WebConnect回帰

実行:

```text
node --test
  work/verify-story902-e470-browser-transport.cjs
  work/verify-story902-e470-webconnect.cjs
  work/verify-dojo-api-client.mjs
  work/verify-attendance-summary-firebase.cjs
  work/verify-webconnect-core.cjs
  work/verify-webconnect-http-step7c.cjs
```

結果: **39/39 PASS**

確認済み:

- ブラウザTransport: 6/6 PASS
- E470既存基盤: 6/6 PASS
- attendance summary / Firebase進捗契約: 8/8 PASS
- WebConnect core / HTTP境界 / dojoApiClient: 全PASS
- GET 1回、通常URL、許可parameterのみ
- 未認証時request 0回
- candidate、非DEV、非Firebase拒否
- HTTP 403、member不一致でJudge未生成
- token、Authorization、uidが結果JSONへ混入しない
- GAS JSONP経路維持

### DEVビルド

```text
npm run target:build -- dev-firebase
```

結果: PASS

- deploy verify: 46 reachable local files
- JavaScript構文・相対依存: PASS
- 新規スクリプトは `.build/dev-firebase/web/qr` に含まれる
- Cloud Runのコード変更は不要

## 実通信の実行方法

前提: 後続工程でこの変更をDEV Hostingへ反映した後に実施する。今回は未配信・未通信。

1. 次を開く。

```text
https://dojo-management-dev.web.app/qr/attendance_summary.html
```

2. 既存AuthGateの案内に従い、Googleログインして同じ画面へ復帰する。
3. ブラウザコンソールまたは承認済みautomationから、次の1回だけ実行する。

```javascript
await window.DOJO_STORY902_E470_SESSION.runAttendanceProgress({
  case_id: "902-E470",
  target_month: "2026-10",
  date_from: "2026-10-01",
  date_to: "2026-10-31",
  member_ids: ["ITER004DEV_MEMBER_20261020"],
  reception_scopes: [],
  expected: {
    attendance_minutes_by_member: {
      ITER004DEV_MEMBER_20261020: 120
    }
  }
});
```

4. 戻り値だけを確認する。
   - `project_id === 'dojo-management-dev'`
   - `backend === 'firebase'`
   - `mode === 'READ_ONLY'`
   - `calls[0].action === 'attendance_progress_summary'`
   - `calls[0].method === 'GET'`
   - `actual.attendance.members` の対象月分
   - `judge.status`
5. Networkで通常URL、GET 1回、HTTP statusを確認する。token/headerは表示・コピー・保存しない。

`120`は既知の期待値を使う場合の例であり、実行承認時にExcel/既存確認結果と照合して確定する。通常リビジョンが `attendance_by_date` をまだ返さない場合は、0ではなく `PARTIAL / UNSUPPORTED` となる。

## 既存画面への影響

- 表示UIの追加なし。
- 通常の「表示」操作は従来コードのまま。
- E470実行はDEV Firebaseだけに公開し、GAS・他targetでは生成しない。
- 認証状態、入力値、画面のsummary request sequenceを変更しない。
- 実行関数を呼ばない限り追加通信なし。

## 残課題

- DEV Hostingへ未配信のため、実ブラウザではまだ利用不可。
- `ITER004DEV_MEMBER_20261020` の現在の有効性は初回GETで確認する。
- 通常リビジョン `00047-xlf` が `attendance_by_date` を返さない場合、結果はPARTIAL。candidateへ切り替えず、通常配信契約の扱いを別途判断する。
- admin claimのboolean preflightは本Transportに含めていない。`attendance_progress_summary` はadmin以外の正当な先生・本人にも許可されるため。後続のadmin限定action追加時に別途必須とする。

## 実施していないこと

- Firebase/GAS実通信
- データ書込み、TimeTrip変更
- commit、push、deploy
- 認証方式・API・Cloud Run・Firestore変更
