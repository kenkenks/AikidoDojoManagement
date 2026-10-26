# STORY-902 E470 Hosting反映前監査（2026-10-25）

## 結論

E470ブラウザ認証Transport自体は、認証・GET限定・通常Cloud Run URL固定・DTO変換の契約を満たし、関連回帰52件と`dev-firebase`ビルドはPASSした。

ただし、現在の作業ツリーから生成したFirebase Hosting成果物には、STORY-902とは無関係な未コミットの紙取込関連変更も含まれる。Firebase Hostingは`.build/dev-firebase/web`全体を配信するため、現時点ではSTORY-902だけを安全に反映できる状態とは判定しない。意図した同時配信であることを確認するか、配信元をクリーンな作業ツリーへ分離して再ビルドするまでHosting反映は保留（NO-GO）とする。

## 1. STORY-902の変更6ファイル

| ファイル | 区分 | 差分概要 | Hosting配信 |
|---|---|---|---|
| `web/qr/attendance_summary.html` | 変更 | 共通判定JSとブラウザTransportを読み込み、DEV限定の実行入口を公開 | 対象 |
| `web/qr/story902_e470_common.js` | 新規 | 入力DTO、Actual正規化、`UNSUPPORTED`、Judge生成の共通処理 | 対象 |
| `web/qr/story902_e470_browser_transport.js` | 新規 | 既存Auth/APIクライアントを使う認証付きGET Transport | 対象 |
| `work/story902-e470-webconnect.cjs` | 新規 | Node側E470ランナー。共通判定処理を再利用 | 対象外 |
| `work/verify-story902-e470-browser-transport.cjs` | 新規 | ブラウザTransport、認証、URL、HTML契約のテスト | 対象外 |
| `docs/current-work/STORY-902-E470-browser-auth-transport-20261025.md` | 新規 | 前工程の詳細報告 | 対象外 |

前工程由来の`work/verify-story902-e470-webconnect.cjs`等、上表以外の未追跡資産も存在するが、この6ファイルの実装差分には混在させていない。

## 2. attendance_summary.htmlの変更

- 既存の`dojo_api_client.js`の後に`story902_e470_common.js`、続いて`story902_e470_browser_transport.js`を読み込む。
- 既存の`summaryAuth`、`summaryApi`、`summaryAuthGate`をそのまま再利用する。
- `runtime === firebase`かつ`target === dev-firebase`の場合だけTransportを生成する。
- 公開入口は凍結した`window.DOJO_STORY902_E470_SESSION.runAttendanceProgress`のみ。
- E470用ボタンや自動実行は追加しておらず、ページ表示だけでは通信しない。
- 既存の進捗取得、描画、UID切替隔離、GAS JSONP分岐は変更していない。

## 3. 既存の出席・審査進捗への影響

既存の進捗API、DTO、画面描画、認証初期化には変更なし。新規処理は明示的に公開入口を呼んだときだけ動作する。既存画面回帰、GAS/Firebase DTO、同日複数枠、繰越・残数、審査基準フォールバックはすべてPASSした。

## 4. JS読み込み順序と依存関係

実際の順序は次の通り。

1. `virtual_session.js`
2. `runtime_config.js`
3. `firebase_auth.js`
4. `auth_gate.js`
5. `page_initialization_manager.js`
6. `dojo_api_client.js`
7. `story902_e470_common.js`
8. `story902_e470_browser_transport.js`
9. ページ内初期化コード

Transport生成時点で、RuntimeConfig、Auth、API Client、共通判定処理がすべて利用可能。ビルド検証でも相対依存の欠落はない。

## 5. 認証・接続先の安全性

- `authClient.ready`完了後、`getCurrentUser()`が存在しない場合は`UNAUTHENTICATED`でHTTP要求前に停止する。
- API送信は既存`dojo_api_client.js`を使うため、IDトークンは既存経路でBearer付与される。結果DTO、呼出記録、ログへトークンを渡さない。
- actionは`attendance_progress_summary`のみ、methodは`GET`のみ。
- `runtime_config.apiBaseUrl`が通常URL `https://dojo-time-travel-admin-374758850136.asia-northeast1.run.app`と完全一致しない場合は生成を拒否する。
- `candidate---` URL、非DEV target、非Firebase runtime、別Firebase projectを拒否する。
- 紙取込専用のcandidate設定はE470では参照しない。

## 6. ビルド成果物

実行結果：`npm run target:build -- dev-firebase` PASS。

- 依存検証：46 reachable local files PASS
- Firebase project：`dojo-management-dev`
- Hosting公開元：`.build/dev-firebase/web`
- Web成果物：`.build/dev-firebase/web/qr`
- 次の3ファイルはソースとビルド成果物のSHA-256が一致した。
  - `attendance_summary.html`: `1A86D98604321187A185EE8BBD7EF1435DA942F39C7C4FC64BB0EE1F235E06FA`
  - `story902_e470_common.js`: `6E8F7C07757EF9498A8AB649A9D9DE5EC2CDC2C704892D9C2B3D5AE013B40BBA`
  - `story902_e470_browser_transport.js`: `1CC7C137DF4852252D8B0D454588DEC1EABB7747E94775DFF367DC4625C93E0B`

## 7. テスト結果

### E470・WebConnect・画面契約

次の6スイートを直列実行し、39/39 PASS。

- ブラウザTransport
- Node E470ランナー
- Dojo API Client
- attendance summary Firebase画面
- WebConnect core
- WebConnect HTTP

確認内容には、未認証時の通信前停止、通常DEV URLのGET 1回、候補URL拒否、秘密情報の結果非混入、HTTP異常時にJudgeを作らないこと、GAS JSONP分岐維持を含む。

### 出席・審査進捗回帰

追加3スイートを直列実行し、13/13 PASS。

- GAS進捗集計
- Firestore進捗Reader（モック）
- 共通進捗投影

総計52/52 PASS。実通信とデータ書込みは行っていない。

## 8. Hostingだけを更新するコマンド

正規手順はリポジトリルートで次を実行する。

```powershell
npm run target:build -- dev-firebase
npm run target:push -- dev-firebase
```

`target:push`は内部で`.build/dev-firebase/web`を作業ディレクトリとして、次だけを実行する。

```powershell
firebase deploy --only hosting --project dojo-management-dev
```

この経路はHostingだけを更新する。Cloud Runのdeploy/promote、Firestore書込み、TimeTrip変更、GAS配信は含まれない。ビルド時にCloud Run用成果物もローカル生成されるが、配信はされない。

## 9. 配信を止める要因

現在の`web/qr`にはSTORY-902以外に少なくとも次の未コミット・未追跡変更があり、ビルド成果物にも含まれた。

- `paper_attendance_preprocess_runner.py`
- `paper_attendance_preprocess_worker.js`
- `paper_attendance_review.html`
- `paper_attendance_review.js`
- `paper_attendance_paper_detector.js`
- `paper_attendance_rectify.py`
- `p3-6/`配下

`firebase.json`の公開ディレクトリは`.`であり、Firebase Hosting deployは成果物全体を対象にする。実通信禁止のため現在配信中のHostingとの差分照合は行っておらず、上記が既に配信済みかもこの監査では確定していない。

## 10. 反映可否と次の判断

E470実装単体は反映可能品質。ただし現在の作業ツリーからのHosting全体配信はNO-GO。

次のいずれかを先に決める必要がある。

1. 紙取込関連も意図した同時配信対象として承認し、現在配信版との差分監査を別途行う。
2. STORY-902対象だけを含むクリーンな作業ツリー／worktreeで再ビルドし、生成物差分を再監査する。

この監査ではソース変更、実通信、データ書込み、commit、push、deployを実施していない。
