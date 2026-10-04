# Firebase / Google Cloud 課金構造（道場システム）

## 1. 基本

`dojo-management-dev`
はBlaze（従量課金）を使用する。Blazeは「常に高額な固定費が発生するプラン」ではなく、対象サービスの利用量に応じてGoogle
Cloud Billing Accountへ計上される。

Firebase公式ではSparkを無償、Blazeをpay-as-you-goとして案内しており、Blazeにも各サービスの無償枠が含まれる。

## 2. 課金の見取り図

``` text
Google Cloud Billing Account
          |
          v
 dojo-management-dev
          |
          +-- Firebase Hosting
          |     +-- storage
          |     `-- data transfer
          |
          +-- Firebase Authentication
          |     `-- provider / MAU等
          |
          +-- Cloud Firestore
          |     +-- document reads
          |     +-- document writes
          |     +-- document deletes
          |     +-- index reads
          |     +-- storage
          |     `-- network
          |
          +-- Cloud Run
          |     +-- requests
          |     +-- CPU
          |     +-- memory
          |     `-- network
          |
          +-- Cloud Build
          |     `-- build time
          |
          `-- Artifact Registry
                `-- image storage / transfer
```

## 3. Cloud Runの考え方

現在devは `min instances = 0`。Cloud
Runはトラフィックがなければscale-to-zeroできる。request-based
billingでmin=0の場合、idle instanceを常時維持する構成ではない。

ただし「max=1だから絶対に費用上限が固定される」という意味ではない。max
instancesはスケーリング制御であり、Billing Budgetもhard
capではない。API側のrate limit、request
size、認証・認可と合わせてコスト防御する。

## 4. Firestore

Firestoreは主にdocument read/write/delete、index entry
read、storage、networkで課金される。したがって、不要な全件scanや高頻度pollingを避け、API単位で必要なデータだけ読む設計が重要。

## 5. Hosting

Firebase Hostingはstorageとdata
transferが主な課金要素。devではHTML/JSのキャッシュ制御を開発容易性優先にしているため、本番では性能と転送量を見ながらcache
policyを再設計する。

## 6. Authentication

Google認証などのFirebase
Authenticationと、SMS/電話番号系は課金構造が同一ではない。認証方式を決める際はUXだけでなく現在のFirebase料金表を確認する。

## 7. 開発時の費用抑制

-   dev Cloud Runは `min=0`
-   現在 `max=1`
-   不要な再deployを減らす
-   Firestore read/writeをテストで無制限に発生させない
-   public APIにrate limit等を追加する
-   Billing Budget / Alertを設定する
-   本番導入時はdevとprodをProject分離する

## 8. 重要

料金は変更される。金額をこの文書へ固定値として長期保存せず、導入・見直し時には公式料金表を確認する。

公式: - https://firebase.google.com/pricing -
https://firebase.google.com/docs/firestore/pricing -
https://cloud.google.com/run/pricing
