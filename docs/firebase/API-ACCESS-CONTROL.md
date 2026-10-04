# APIアクセス制御方針（会員・先生・管理者）

## 1. 基本原則

**認証・認可の仕組みは厳密に存在させるが、必要のない利用者には極力見せない。**

会員にFirebase、ID Token、Cloud
Run等を理解してもらうことを前提にしない。

## 2. 会員UX

日常利用では既存のQR思想を維持する。

``` text
会員から見える世界

QRを読む
   ↓
必要な画面が開く
   ↓
操作する
```

裏側:

``` text
QR / access credential
   ↓
Dojo API Server
   ↓
API Guard
 ├─ credentialの正当性
 ├─ 対象会員
 ├─ 許可scope
 ├─ 有効期限
 ├─ rate limit
 └─ 必要ならnonce / replay防止
   ↓
許可されたApplication/Coreだけ
```

## 3. QRはmemberIdそのものにしない

`M001` のような推測可能な識別子だけをアクセス資格にしない。

将来のcredential概念例:

``` text
subject   = member
scope     = attendance
expiry    = ...
nonce     = ...
signature = ...
```

重要なのは「このQRで何でもできる」ではなく、用途をAPI側で限定すること。

## 4. 先生・管理者

強い権限は明示認証する。

``` text
先生 / 管理者
 ↓
Google Login等
 ↓
Firebase Auth
 ↓
Firebase ID Token
 ↓
Dojo API Guard
 ↓
uid / role / scope確認
 ↓
teacher / admin API
```

Googleでログインできたこと自体をteacher/admin判定にしない。Firebase
Authは本人確認、道場側が権限を判断する。

## 5. 将来のアカウント対応

``` text
Firebase uid
     ↓
UserAccount
 ├─ memberId
 └─ role / scope
      ├─ member
      ├─ teacher
      └─ admin
```

role構造やUserAccountの物理データモデルは未確定。実装前に既存Member/先生データとの関係を調査する。

## 6. Firebase Authを全操作へ強制しない

Firebase
Authは共通の有力な本人確認基盤だが、会員の日常QR操作まで毎回Googleログインを要求する設計にはしない。

必要に応じて: - QRで限定操作 -
個人情報閲覧など本人性が強く必要な操作ではFirebase Auth等 -
先生・管理者は明示認証

という複数入口をDojo API ServerのGuardで統合する。

## 7. セッション

現在の管理者向けFirebase Webは `browserSessionPersistence`
を使用している。タブ/ウィンドウを閉じるまでのSESSION型。

Firebase AuthはLOCAL / SESSION /
NONEを提供する。本番で会員向け認証を追加する場合、UXと端末共有リスクを踏まえて別途決定する。

## 8. 現時点で確定していること

-   TimeTrip管理APIはFirebase Auth + admin claimで実証済み。
-   API GuardはApplication/Coreより外側に置く。
-   会員には認証基盤の技術詳細を見せない。
-   会員QRアクセスもAPI側で制限する。
-   QR、Firebase
    Authのどちらも「Application/Coreを直接公開する」手段にはしない。

## 9. 未決事項

-   会員個人ポータルにFirebase Authを要求する範囲
-   Google / email link等の会員向けprovider
-   `uid ↔ memberId` の物理テーブル/collection
-   teacher/admin role管理方式
-   QR credentialの署名・期限・nonce方式
-   rate limit / App Check等の追加防御

これらは次の設計フェーズで決定する。
