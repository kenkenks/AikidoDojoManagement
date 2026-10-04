# Firebaseアーキテクチャ（道場システム）

## 1. 基本構成

``` text
[iPhone / Browser]
        |
        v
+---------------------+
| Firebase Hosting    |
| Web UI              |
+----------+----------+
           |
           | Firebase Auth / ID Token
           v
+-----------------------------+
| Cloud Run                   |
| Dojo API Server             |
|-----------------------------|
| CORS                        |
| Authentication / API Guard  |
| HTTP routing / JSON         |
+-------------+---------------+
              |
              v
+-----------------------------+
| Application/Core            |
| Business Logic              |
+-------------+---------------+
              |
              v
+-----------------------------+
| Business DAO                |
+-------------+---------------+
              |
              v
+-----------------------------+
| Firestore Core              |
+-------------+---------------+
              |
              v
+-----------------------------+
| Cloud Firestore             |
+-----------------------------+
```

Cloud
Runは新しいBusiness層ではない。HTTP、CORS、認証・認可、routing、request
guardを担当し、業務ロジックはApplication/Coreに置く。

## 2. TimeTripで実証した経路

``` text
time_travel.html
 ↓
firebase_auth.js
 ↓
dojo_api_client.js
 ↓
OPTIONS 204
 ↓
GET / POST /api/admin/time-travel
 ↓
admin-server.cjs
 ↓
admin-api.cjs
 ↓
TimeApplicationCore
 ↓
DAO_Business_Setting
 ↓
DAO_Core_Firestore
 ↓
Firestore
```

## 3. Dojo API Serverの将来像

物理的にはまず1つのAPI Serverとして運用し、論理的にdomain
routeを分離する。

``` text
Dojo API Server
 ├─ /hello
 ├─ /api/admin/time-travel
 ├─ /api/members
 ├─ /api/attendance
 ├─ /api/payments
 └─ ...
```

負荷、セキュリティ境界、ライフサイクルが本当に異なる段階でのみ物理分割を検討する。

## 4. Cloud Runの現在のdev設定

``` text
service      = dojo-time-travel-admin
region       = asia-northeast1
min          = 0
max          = 1
cpu          = 1
memory       = 512Mi
concurrency  = 8
```

`min=0`
はアクセスがないときscale-to-zeroできる構成。最初のアクセスではcold
startが発生し得る。

## 5. 認証と認可の境界

``` text
Authentication
「誰か」
   ↓
Authorization
「道場で何をしてよいか」
```

Firebase Authだけで道場内権限を決めない。将来はFirebase `uid`
と道場側UserAccount/Memberを対応付け、`member / teacher / admin`
等のrole・scopeを道場側で判断する。

## 6. サーバーIDと利用者ID

``` text
利用者:
Google等 → Firebase Auth → ID Token → Cloud Run

サーバー:
Cloud Run → Service Account / ADC → Google Access Token → Firestore
```

両者は別のcredentialであり、責任も別である。
