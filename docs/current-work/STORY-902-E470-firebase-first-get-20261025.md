# STORY-902 第4段階：Firebase DEV WebConnect初回GET

作成日: 2026-10-25
結果: 実行条件不足のためWebConnect GETは未実行

## 結論

Cloud Runの接続先・通常リビジョン、actionの配信実績、コード上のread-only性は確認できた。一方、正規Firebase認証セッションを確立できず、候補のDEVテスト会員が現在も有効であることも確認できなかった。指示どおり、条件未確定の状態ではGETを送信していない。

## 実行前確認

### 1. 接続先とリビジョン

- project: `dojo-management-dev`
- service: `dojo-time-travel-admin`
- 設定上の通常URL: `https://dojo-time-travel-admin-374758850136.asia-northeast1.run.app`
- 通常100%リビジョン: `dojo-time-travel-admin-00047-xlf`
- candidate: `dojo-time-travel-admin-00078-bir`
- candidate traffic: 0%
- candidate URL: `https://candidate---dojo-time-travel-admin-q6ujypei6a-an.a.run.app`
- 意図しないpromote、traffic変更なし。

確認方法は `gcloud run services describe` のread-only取得のみ。Cloud Runの変更操作は実施していない。

### 2. actionの配信状況

Cloud Logging上で通常リビジョン `00047-xlf` に対する次の既存実績を確認した。

- method: GET
- path/action: `/api/webconnect?action=attendance_progress_summary`
- response: HTTP 200
- revision: `dojo-time-travel-admin-00047-xlf`

したがって、通常URLの現行リビジョンにaction自体が配信済みであることは確認済み。ただし、今回指定したテスト会員に対する新しいGETは送っていない。

### 3. テスト会員とscope

候補:

- member_id: `ITER004DEV_MEMBER_20261020`
- target_month: `2026-10`
- date_from: `2026-10-01`
- date_to: `2026-10-31`
- action scope: 単一会員

このIDは既存の作業記録でDEVテスト会員候補として扱われている。一方、ローカル設定にfixture定義はなく、Cloud LoggingにもこのIDの既存通信実績は見つからなかった。Firestoreへ直接問い合わせる別経路は使わず、現在の有効性は未確認とした。

参考として通常リビジョンには別会員への同action成功実績があるが、実会員をテスト対象へ代用していない。

### 4. 対象年月・日付範囲

- E470対象年月候補: `2026-10`
- 日付範囲: `2026-10-01`～`2026-10-31`

`attendance_progress_summary` 自体は全期間の日付別結果を返し、E470 Adapterが `target_month` で絞る。今回の単発GETのURLパラメータは `member_id` のみで、TimeTrip変更や暗黙月の採用はない。

### 5. 認証主体

- 必要方式: 既存のFirebase Authログインから得る正規Firebase ID token
- actionの認可: 管理者、active teacher、または対象会員本人に紐づく主体
- 画面で確認した状態: Firebaseログイン未確立
- Googleログイン開始を試みたが、正規Firebase userを確認できる状態まで完了しなかった。

トークンをCLI、URL、コンソール、ファイルへ取り出す代替方法は使用していない。認証方式の追加・回避も行っていない。

### 6. 副作用

`attendance_progress_summary` のCloud実装は次のreadのみを実施する。

- `members/{member_id}`
- 対象会員の `attendances`
- `examination_standards`
- `ranks`

集計はpure projectionで行い、Firestore write、transaction write、TimeTrip変更、fixture操作を呼ばない。HTTP境界もGET actionとして登録されている。コード上はread-onlyである。

## GET実行結果

|項目|結果|
|---|---|
|WebConnect GET|未実行|
|HTTPステータス|該当なし|
|業務応答|該当なし|
|共通DTO変換|未実行|
|Judge|`PARTIAL`（事前条件4/6確認、通信判定なし）|

未確定条件:

1. 正規Firebase認証主体と権限
2. `ITER004DEV_MEMBER_20261020` の現在の有効性

## 認証情報・ログ

- Firebase ID tokenは取得・表示・保存していない。
- WebConnect GETを送っていないため、今回のmember_idを含む新規HTTP request logも発生していない。
- 実施したCloud Run/Logging照会には認証トークンをコマンド引数や出力へ含めていない。
- E470 Adapterは、将来の実行時もAuthorization headerを結果JSONへ含めない設計である。

## 次回の最小手順

1. DEV Hosting画面で既存の正規Firebaseログインを完了する。
2. ログイン主体がadmin、active teacher、または対象会員本人として認可されることを画面の既存処理で確認する。
3. 会員選択肢等の既存read-only UIから、`ITER004DEV_MEMBER_20261020` が有効なDEVテスト会員であることを確認する。
4. 通常URLへ `attendance_progress_summary` のGETを1回だけ送る。
5. tokenはブラウザ内の既存 `dojoApiClient` に保持し、表示・保存しない。
6. HTTP 200、`ok:true`、既存進捗項目、`attendance_by_date` を確認し、E470共通DTOへ変換する。

## 実施していない操作

- WebConnect GET / POST
- Firestore / GAS write
- TimeTrip変更
- fixture作成・削除
- API・認証・コード変更
- commit、push、deploy
