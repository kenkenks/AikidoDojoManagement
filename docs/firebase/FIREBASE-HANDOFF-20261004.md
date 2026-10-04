# Firebase開発 引継ぎ --- 2026-10-04

## 1. 完成した基準

TimeTripを先見体として、Firebase
WebからFirestoreまでの読み書き縦断が成立した。

``` text
Firebase Hosting
 ↓
Firebase Auth / Google login
 ↓
Dojo API Client
 ↓
CORS
 ↓
Cloud Run
 ↓
Firebase ID Token + admin claim
 ↓
TimeApplicationCore
 ↓
DAO_Business_Setting
 ↓
DAO_Core_Firestore
 ↓
Firestore
```

## 2. 実機確認

-   Google login: PASS
-   Auth session復元 / F5: PASS
-   CORS OPTIONS: 204 PASS
-   GET: 200 PASS
-   POST TimeTrip ON: 200 PASS
-   保存後GET: PASS
-   POST TimeTrip OFF: 200 PASS
-   最終GET: PASS
-   Disable cache ONで往復: PASS
-   Disable cache OFF + F5: PASS
-   通常cache条件でON→OFF: PASS
-   最終状態: 実時刻

## 3. Git

CORS:

``` text
2a7c1aa feat: allow Firebase Hosting CORS for TimeTrip API
```

Step 5 Web POSTは実機PASS後、`web/qr/time_travel.html` と
`work/verify-time-travel-firebase-get.mjs`
の2ファイルをcommit/pushする段階まで進んだ。 次チャット開始時は
`git status` と直近commitを確認し、未commitならまずStep 5を確定する。

## 4. 現在の重要設計

-   `.build` がtarget-specific deployment boundary。
-   Cloud Runは新Business層ではない。
-   Firebase Auth end-user identityとCloud Run/ADC server
    identityを分離。
-   ID Token refreshはFirebase Web SDKへ任せる。
-   CORSはAuthより前でOPTIONS処理。
-   会員UXでは認証技術を見せず、既存QRを入口にAPI
    Guardで限定アクセスする方向。
-   先生/管理者は明示的なFirebase Authを使用可能。
-   認証(Authentication)と道場権限(Authorization)を分離する。

## 5. 次チャット候補

1.  Step 5 commit/push状態確認
2.  このFirebase資料群をrepository `docs/firebase/` へ追加
3.  API Access Controlの設計調査
4.  TimeTripを標準リファレンスとしてMember / Attendance /
    Paymentへ横展開
5.  QR credential / role / UserAccountは実装前に既存構造を調査

## 6. 資料

-   FIREBASE-INTRODUCTION.md
-   FIREBASE-ARCHITECTURE.md
-   FIREBASE-BILLING.md
-   FIREBASE-COMMANDS.md
-   API-ACCESS-CONTROL.md
