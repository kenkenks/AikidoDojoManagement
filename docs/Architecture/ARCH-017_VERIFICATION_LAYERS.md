# ARCH-017 動作確認レイヤー

STATUS: ACTIVE
TYPE: ARCHITECTURE
AREA: VERIFICATION
PRIORITY: HIGH

TAG: ARCH
TAG: TEST
TAG: RUNNER
TAG: E2E
TAG: DOMAIN

---

# 1. 目的

本システムの動作確認を、確認対象の境界によって3レイヤーに分離する。

```text
単体動作確認
↓
E2E動作確認
↓
ドメイン動作確認
```

下位レイヤーのPASSは、上位レイヤーのPASSを意味しない。
各レイヤーは異なる種類の不具合を検出する。

---

# 2. 単体動作確認

関数、Service、Core、画面入口、Sheet操作など、部品または限定された連携単位を確認する。

主な確認対象：

- 入力と出力
- 状態遷移
- Sheet更新
- エラー条件
- 個別API契約

例：

```text
billing_acceptMonthlySelection
↓
04_月次選択が作成される
```

Debug、Unit Runner、Integration Runnerは主にこのレイヤーを担当する。

---

# 3. E2E動作確認

システム上の実入口から最終出力まで、複数Service・Sheetを横断して確認する。

処理が個別に成功するだけでなく、業務Contextが入口から出口まで失われないことをVerifyする。

代表的なContext：

- member_id
- billing_group_id
- invoice_id
- location_id
- billing_block_id
- payment_method
- amount

例：

```text
会員PayPay開始
↓
月額宣言 / 請求生成
↓
09 決済エビデンス
↓
CONFIRMED
↓
06 入金ログ / POSTED
↓
先生側「本日・この課金枠」集計
```

このレイヤーでは、途中の成功だけでPASSにしない。
最終出力とContext整合性まで確認する。

E2E Runnerはこのレイヤーを自動化する。

---

# 4. ドメイン動作確認

実際の利用者、操作順序、QR、時間、現場条件を含め、道場業務として成立するかを確認する。

例：

```text
会員が支払いQRを読む
↓
PayPayコードを登録する
↓
先生が決済更新する
↓
先生画面の現金・PayPay・合計が実際の受付と一致する
```

主な確認対象：

- 実際の操作導線
- 人が理解できる表示
- QR / Session / 時刻など現場Context
- 複数支払方法が混在した場合の整合性
- 業務として一周できるか

ドメイン動作確認は、自動Runnerだけで完結させることを目的としない。
実運用に近い操作確認を最終境界とする。

---

# 5. Runnerの位置づけ

Runnerは一種類とみなさず、保証する境界を明示する。

```text
Unit / Integration Runner
    部品・限定連携を保証

E2E Runner
    システム入口から出口とContext連鎖を保証

Domain Verification
    実画面・実QR・人の操作で業務成立を保証
```

Runner名または文書上で、どのレイヤーを保証するRunnerか判別できるようにする。

---

# 6. 不具合発見時の扱い

ドメイン動作確認で不具合を発見し、既存RunnerがPASSしていた場合は、単にバグを修正して終わらせない。

1. どの動作確認レイヤーで抜けたかを特定する。
2. 再発を検出できるE2E RunnerまたはIntegration Runnerを追加する。
3. バグ修正後、そのRunnerを回帰確認として残す。

今回の会員PayPay受付では、各処理は成功していたが `location_id / billing_block_id` が決済経路で失われ、先生側課金枠集計にPayPayが含まれなかった。
これは単体確認だけでは検出できず、E2EのContext連鎖確認が必要な例である。

---

# 7. 関連文書

- ARCH-003 Runner設計
- ARCH-014 Runner契約・入口パターン設計
- ARCH_SESSION セッション管理フレームワーク

## Runnerの実行契約

GASエディタから実行するRunnerには、引数なしで実行できるエントリポイントを用意する。
Runnerは結果をログへ出力し、検証失敗時は `{ ok:false }` を返すだけで終了せず例外を送出する。
これにより、Apps Scriptの実行結果そのものから PASS / FAIL を判別できるようにする。

