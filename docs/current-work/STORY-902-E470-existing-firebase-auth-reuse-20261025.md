# STORY-902 第4段階補足：既存Firebase認証の再利用確認

作成日: 2026-10-25
作業区分: コード読取・設計確認のみ

## 結論

Firebase Hosting画面には、正規ログイン、session persistence、ID token取得、Bearer付与、401時の一度だけのtoken refreshまで既存実装がある。WebConnectのGETも複数画面でこの経路を使用している。

一方、現在のNode版E470ランナーには、Hostingブラウザ内のFirebaseセッションを再利用するTransportがない。`getAuthorization()`へブラウザ外で取得したtokenを渡す方法は、tokenのコピー・環境変数化・ログ混入を招くため採用しない。

安全な最小構成は、既存Hosting画面内で既存 `dojoApiClient.request()` を使ってGETを実行し、tokenをブラウザ外へ出さず、HTTP statusと業務応答だけをE470ランナーの共通DTO変換へ渡す「ブラウザ内Transport」である。過去の候補リビジョン検証スクリプトに同じ実績がある。

今回は調査のみであり、Transport追加、実通信、認証操作は行っていない。

## 1. 既存Firebase Hosting認証経路

### 初期化・ログイン

対象実装: `web/qr/firebase_auth.js`

1. `DOJO_RUNTIME_CONFIG.firebase` の `apiKey / authDomain / projectId / appId` を検証する。
2. Firebase AppとAuthを初期化する。
3. `browserSessionPersistence` を設定する。
4. `authStateReady()` を待つ。
5. `auth.currentUser` を保持し、`onAuthStateChanged()`で更新する。
6. 未認証時は既存 `GoogleAuthProvider` + `signInWithPopup()` を使う。

認証状態はタブ・ウィンドウ単位のSESSION型であり、永続tokenファイルを作成しない。

### 共通認証ゲート

対象実装: `web/qr/auth_gate.js`、`web/qr/index.html`

- 業務画面は `AuthGate.requireAuthenticated()` で認証完了を待つ。
- 未認証時は既存 `index.html?return_url=...` へ誘導する。
- `return_url` は同一origin・`/qr/`配下のみを許可し、ログインループを拒否する。
- 認証後は元画面へ復帰する。

新しいログイン画面、認証API、token保存は不要である。

## 2. WebConnectへ認証付きGETを送る既存実装

対象実装: `web/qr/dojo_api_client.js`

```text
firebaseAuthClient.getCurrentUser()
  -> user.getIdToken()
  -> Authorization: Bearer <token>
  -> fetch(GET /api/webconnect?...)
  -> HTTP 401 の場合だけ user.getIdToken(true) で1回再試行
```

`dojoApiClient` はtokenを返却・記録せず、request headerへその場で設定する。

実利用例:

- `attendance_summary.html`: `attendance_progress_summary`
- `qr_generator.html`: WebConnect GET
- `payment_teacher.html`: 会費受付関連GET
- `paper_attendance_review.js`: `attendance_progress_summary` 等

特に `attendance_summary.html` は次の経路が完成している。

```text
summaryAuth.ready
 -> summaryAuth.getCurrentUser()
 -> summaryApi.request(normalApiBase + /api/webconnect, {method:'GET'})
```

この画面は `DOJO_RUNTIME_CONFIG.apiBaseUrl` をそのまま使い、紙取込専用candidate URLへ切り替えない。

## 3. DEV管理者権限の確認方法

サーバーの正本は、失効確認付き `verifyIdToken(token, true)` の結果にある `user.admin === true` である。Googleログイン成功だけでは管理者にならない。

### 推奨preflight

既存Firebase userに対し、ブラウザ内で `getIdTokenResult(false)` を呼び、raw tokenを出力せず `claims.admin === true` のbooleanだけを確認する。

```text
const result = await firebaseAuthClient.getCurrentUser().getIdTokenResult(false);
result.claims.admin === true
```

これは既存Firebase Auth SDKのセッションを参照するだけで、新しい認証機構ではない。token文字列、全claims、email、uidはログへ出さない。

ただしclient-side確認はpreflightであり、最終的な認可判定はCloud RunのHTTP 403/非403である。`attendance_progress_summary` はadmin以外にもactive teacherまたは本人が利用できるため、このactionの200だけではadminを証明しない。後続の `payment_reception_summary` はadmin限定なので、E470全体ではadmin claimが必要になる。

## 4. E470ランナーから安全に再利用する方法

### 採用案: ブラウザ内Transport + オフライン判定

既存資産の再利用範囲:

- 認証: `firebase_auth.js`
- 認証ゲート: `auth_gate.js` / `index.html`
- token付与と401 refresh: `dojo_api_client.js`
- 接続先: `DOJO_RUNTIME_CONFIG.apiBaseUrl`
- DTO変換・Judge: `work/story902-e470-webconnect.cjs`

処理順序:

1. DEV Hostingの既存Firebase画面を開く。
2. 既存AuthGateから `index.html` のGoogleログインを完了し、元画面へ戻る。
3. runtime targetが `dev-firebase`、Firebase projectが `dojo-management-dev`、base URLが通常URLであることをブラウザ内で検証する。
4. currentUserの存在と、必要ならadmin booleanだけを確認する。
5. E470が生成した固定request envelopeをブラウザ側へ渡す。内容はaction、member_id、対象月等の非秘密情報だけとする。
6. ブラウザ側がallowlist、GET、通常URLを再検証し、既存 `dojoApiClient.request()` を1回呼ぶ。
7. ブラウザ側は `{backend, action, http_status, body}` のみ返す。Authorization header、token、user object、claims全体は返さない。
8. Nodeランナーは応答JSONを `attendanceMinutes()`、`buildJudge()` 等の既存変換へ渡し、共通結果DTOを保存する。

### 既存の実績

次の既存ブラウザ検証スクリプトは、同じ安全モデルを使用している。

- `work/FW001_candidate_00045_progress.browser.js`
- `work/FW002_candidate_00047_member_info.browser.js`
- `work/FW002_candidate_00049_reception_summary.browser.js`

これらはHostingの既存 `firebaseAuthClient` / `dojoApiClient` を利用し、`getIdToken()`を直接呼ばず、tokenをログへ出さない。

### 現在の不足

`work/story902-e470-webconnect.cjs` のNode Adapterは `getAuthorization()`からAuthorization文字列を受け取る契約で、ブラウザセッションと直接接続できない。したがって現状のまま安全に自動実通信することはできない。

次工程では、次のどちらか一方の局所実装が必要になる。

1. 推奨: ブラウザ側でGETし、sanitized response JSONをランナーへ取り込む入力モード。
2. 将来案: ブラウザautomationをTransport callbackとして接続し、responseだけをNodeへ返す一時的な同一実行セッション。

いずれもtokenをNodeへ渡さない。tokenの手作業コピー、CLI引数、環境変数、設定ファイル、結果JSONへの保存は採用しない。

## 5. テスト会員の有効性確認

対象候補: `ITER004DEV_MEMBER_20261020`

既存read action `attendance_progress_summary` で確認できる。

- HTTP 200 + `ok:true` + `member_id`一致: 有効会員かつ認可済み
- HTTP 400 + `ok:false` + 「有効な会員が見つかりません。」: 未存在または無効
- HTTP 401: Firebase認証不成立
- HTTP 403: 対象会員への閲覧権限なし
- HTTP 503: reader/Firestore取得失敗であり、有効性を判定しない

このactionは会員・出席・審査基準を読むだけで、fixture作成や更新を行わない。したがって、初回GETそのものを有効性確認とE470読取の両方に利用でき、別の事前GETを増やす必要はない。

adminでない場合は、active teacherまたは `user_accounts` からserver-side解決された本人member_idだけが許可される。token claimsやURLのmember_idから本人関係を推測しない。

## 6. 通常リビジョン00047への接続

使用URL:

```text
https://dojo-time-travel-admin-374758850136.asia-northeast1.run.app/api/webconnect
  ?action=attendance_progress_summary
  &member_id=ITER004DEV_MEMBER_20261020
```

接続先は手入力でcandidateへ差し替えず、Hosting配信済み `DOJO_RUNTIME_CONFIG.apiBaseUrl` を使う。

実行前検証:

- `RUNTIME_CONFIG.target === 'dev-firebase'`
- `RUNTIME_CONFIG.firebase.projectId === 'dojo-management-dev'`
- `RUNTIME_CONFIG.apiBaseUrl === 'https://dojo-time-travel-admin-374758850136.asia-northeast1.run.app'`
- pathnameが `/api/webconnect`
- methodがGET
- action allowlistが `attendance_progress_summary`
- member_idが固定のDEVテスト会員ID

Cloud Runの直近read-only確認では、通常URLは `dojo-time-travel-admin-00047-xlf` へ100%、candidate `00078-bir` は0%である。candidate URLは使用しない。

## 7. 具体的な初回GET手順

1. `attendance_summary.html` 等、`firebaseAuthClient`と`dojoApiClient`を既に生成するDEV Hosting画面を使う。
2. AuthGateの既存ログイン経路を完了する。
3. browser session内でproject、通常base URL、currentUserを確認する。
4. adminが必要な後続ケースでは `claims.admin === true` のbooleanだけを確認する。
5. 上記固定URLへ `dojoApiClient.request(url, {method:'GET', cache:'no-store', redirect:'error'})` を1回実行する。
6. statusとbodyのみをsanitized responseとしてE470ランナーへ渡す。
7. E470ランナーは `target_month=2026-10` で `attendance_by_date` を集計し、Expected/Actual/Judgeを生成する。
8. 結果JSONにはtoken、Authorization header、Cookie、user、claims、base URLを含めない。

## 8. 次工程の推奨実装単位

局所的な「E470 browser transport」のみを追加する。

- action/method/project/base URL/member_idの固定検証
- 既存 `dojoApiClient.request()` の利用
- responseのsanitization
- Node側のsanitized response取込
- token/header非出力テスト
- 1回限り実行ガード

既存AuthGate、Firebase Auth、API、Cloud Run、Firestore、業務DTOは変更不要である。

## 実施していないこと

- Firebase/GAS/Cloud Runへの実通信
- ログイン操作、token取得
- コード・設定変更
- データ書込み、TimeTrip変更
- commit、push、deploy
