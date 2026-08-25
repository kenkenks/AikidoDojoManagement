# TASK-QR-003 QRシートHTML

## Origin

- ITER-003 道場システム リリース準備
- STORY-QR-001 QR発行
- TASK-QR-001 QR種別・データ仕様定義
- TASK-QR-002 QR生成共通機能
- Google Sheet `00_画面＆QR` の画面・用途別デザインイメージ

## Scope

1. QR種別ごとにHTMLテンプレートを1対1で用意する。
2. QR画像、タイトル、対象名、ID、補助情報を表示する。
3. 用途の識別はQR内部ではなくHTMLシート外観で行う。
4. 既存 `00_画面＆QR` の色・用途の考え方を継承する。
5. ブラウザ印刷可能なレイアウトとする。

## Templates

- member-card.html
- payment-monthly.html
- payment-onetime.html
- dojo.html
- teacher.html

共通化できるQR表示部品、見出し、ID表示等は共有可能とする。

## Display items

| 種類 | 表示項目 |
|---|---|
| 会員カード | 会員カード、氏名、会員ID、QR |
| 月謝 | 月謝、氏名、会員ID、料金プラン名、QR |
| 都度支払い | 都度支払い、氏名、会員ID、料金プラン名、QR |
| 道場 | 道場、道場名、道場ID、QR |
| 先生 | 先生、先生名、先生ID、QR |

## Design principle

QR = 機械が読む情報

HTML Sheet = 人が意味を理解する情報

QR中央へ画像を埋め込まなくても、
タイトル、色、枠、名称、補助情報により用途を明確に区別する。

## Acceptance

- 5種類のHTMLテンプレートが存在する。
- 各テンプレートへQR画像を埋め込める。
- 必要な名称、ID、補助情報を表示できる。
- QR種別を外観から識別できる。
- ブラウザの印刷機能で印刷できる。
- QRの読み取り可能領域をデザインで妨げない。

## Out of scope

- 専用PDF生成
- QR中央ロゴ
- A4複数面付け
- 高度な帳票デザイン
