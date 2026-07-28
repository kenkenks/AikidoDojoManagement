OPS-001 QR起動運用
1. 目的

道場システムを実際に運用する際の、QRコードの配置対象、起動URL、利用主体および起動後の画面を定義する。

QRコードは、単なる画面リンクではなく、利用者・道場・支払プランなどの初期コンテキストをシステムへ渡すための起動入口として扱う。

ただし、URLパラメータそのものをログイン済み権限とはみなさない。

2. QR運用一覧
QR種別	配置対象	起動URL	起動先	主な初期情報
会員証QR	会員証	/attendance?member_id=MXXX	出席画面	member_id
月謝袋QR（月謝）	月謝袋	/paypay_code?member_id=MXXX&plan_id=P001	支払コード画面	member_id, plan_id=P001
月謝袋QR（都度）	月謝袋	/paypay_code?member_id=MXXX&plan_id=P002	支払コード画面	member_id, plan_id=P002
道場QR	道場内	/?location_id=HONBU	index	location_id
先生QR	先生用媒体	/attendanceCheck?teacher_id=T001	出席確認画面	teacher_id
稽古枠QR	なし	なし	なし	なし
その他アクセス	ブックマーク・直接URL等	上記以外	indexへリダイレクト	なし

2.1 その他アクセス

本システムは、2. QR運用一覧に定義されたQRコードからの起動を基本運用とする。

上記以外のアクセス（URL直接入力、ブックマーク、必要なパラメータを持たないアクセス、未定義URL等）は、運用対象外の起動とみなし、indexへリダイレクトする。

アクセス種別	動作
QR起動以外のURL	indexへリダイレクト
必須パラメータ不足	indexへリダイレクト
未定義URL	indexへリダイレクト
ブックマーク・直接入力	indexへリダイレクト

この書き方だと、「エラーにする」のではなく「運用対象外だから入口へ戻す」という設計思想が伝わります。

あと一つだけ追加するとしたら、

認証済みSessionを保持している場合は、リダイレクト後もSessionは維持する。

という一文があると良いと思います。

例えば先生がブックマークを開いても、

ブックマーク
    ↓
index
    ↓
先生Sessionは保持

となるので、ログインし直す必要がありません。

この一文は、これから取り組むSession設計（TASK-DEV-020）とも矛盾せず、運用仕様としても分かりやすくなると思います。

3. 会員証QR
/attendance?member_id=MXXX
運用目的

会員本人が、自身の会員証から出席登録画面を起動する。

起動時の期待動作
会員証QR読取
↓
member_idを検証
↓
会員主体の簡易ログインSessionを生成・更新
↓
出席画面を表示
Sessionへ保持する情報
subject_type = MEMBER
member_id = MXXX

既に道場情報などがSessionに存在する場合は、必要に応じて引き継ぐ。

4. 月謝袋QR
月謝プラン
/paypay_code?member_id=MXXX&plan_id=P001
都度払いプラン
/paypay_code?member_id=MXXX&plan_id=P002
運用目的

会員ごとの月謝袋から、対象会員と支払プランを指定した状態で支払コード画面を起動する。

起動時の期待動作
月謝袋QR読取
↓
member_idを検証
↓
plan_idを検証
↓
会員主体の簡易ログインSessionを生成・更新
↓
支払コード画面を表示
Sessionと画面Context

member_idはログイン主体情報としてSessionへ保持する。

plan_idは、その起動操作で使用する業務Contextとして扱う。

Session
  subject_type = MEMBER
  member_id = MXXX

Payment Context
  plan_id = P001 または P002

plan_idを永続的なログイン主体情報とはしない。

5. 道場QR
/?location_id=HONBU
運用目的

道場内に設置した共通QRからシステムを起動し、利用中の道場を設定する。

起動時の期待動作
道場QR読取
↓
index起動
↓
location_idを検証
↓
道場ContextをSessionへ保存
↓
利用主体に応じた次の操作へ進む
Sessionへ保持する情報
location_id = HONBU

道場QRだけでは、会員または先生としてのログイン主体は確定しない。

したがって、

subject_type
member_id
teacher_id

は道場QRから設定しない。

6. 先生QR
/attendanceCheck?teacher_id=T001
運用目的

先生本人が、出席確認・会費確認などの先生向け業務を開始する。

起動時の期待動作
先生QR読取
↓
teacher_idを検証
↓
先生主体の簡易ログインSessionを生成・更新
↓
権限を確認
↓
出席確認画面を表示
Sessionへ保持する情報
subject_type = TEACHER
teacher_id = T001

先生向け画面では、URLにteacher_idが指定されていることだけをもって先生権限を認めない。

Session上の主体および権限確認を必須とする。

7. 稽古枠QR

稽古枠専用QRは作成しない。

稽古枠QR = なし
理由

稽古枠は以下の情報から、画面内で選択または推定する。

location_id
現在日時
当日の稽古枠
先生
課金枠

稽古枠ごとにQRを配置すると、QRの作成・掲示・更新・差し替えなどの運用負荷が増える。

また、臨時稽古や時間変更時にQR情報と実際の稽古枠が不一致になる可能性がある。

そのため、稽古枠は固定QRに埋め込まず、システム側で決定する。

8. QR情報とSessionの関係

QRのURLパラメータは、Sessionを生成するための入力情報である。

QRパラメータ
↓
マスタ存在確認
↓
起動条件確認
↓
Session生成・更新
↓
権限確認
↓
画面表示

次のような実装にはしない。

URLにteacher_idがある
↓
先生画面をそのまま表示

正しくは、

URLにteacher_idがある
↓
先生情報を検証
↓
先生Sessionを生成
↓
先生権限を確認
↓
先生画面を表示

とする。

9. 主体とContextの分離

QRから渡される情報は、次の二種類に分類する。

ログイン主体
member_id
teacher_id
業務・場所Context
location_id
plan_id
billing_block_id
attendance_slot_id

ログイン主体と業務Contextを混在させない。

例えば、

member_id = 誰が操作しているか
plan_id   = 今回どの支払プランを扱うか

であり、意味が異なる。

10. 現時点の既知課題

現在のQR起動ルートには、以下の問題がある。

・会員証QRから起動してもmember_idがSessionへ保持されない場合がある
・画面遷移後に会員情報が失われる場合がある
・一般会員が先生用画面を起動できる
・URLパラメータとSession情報の優先関係が未定義
・既存Sessionと別主体のQRを読み込んだ場合の切替規則が未定義
・道場Contextが後続画面へ継承されない場合がある

これらは、次のSession起動ルート整備TASKで対応する。

11. 実装TASKとの関係

次のTASKでは、この運用仕様を入力として実装する。

TASK-DEV-020
QR起動ルートと簡易ログインSessionの統合

対象は次です。

会員証QR
月謝袋QR
道場QR
先生QR
直接URLアクセス
画面間遷移
主体切替
権限制御
Logout

この仕様で特に重要なのは、

QR仕様
≠
画面URL一覧

という点です。

これは実際には、

QR
↓
起動ルート
↓
Session生成
↓
権限確認
↓
業務画面

という運用開始プロトコルです。

そして「稽古枠QRなし」も消極的な未実装ではなく、

稽古枠は固定QRへ埋め込まず、道場・日時・運用状況から画面側で決定する

という明確な運用判断として記録できます。