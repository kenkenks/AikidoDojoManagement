# 画面遷移台帳

更新日: 2026-10-19  
版: 初版調査ベースライン  
方針: 現行コードのリンク、`location.href`、`location.replace`、動的URL生成で確認できた遷移だけを記録する。

## 1. 入口

```text
SCR-001 index.html
  ├─ 先生QR／teacher_id／TEACHER Session → SCR-002 teacher_home.html
  └─ 会員QR／member_id／MEMBER Session   → SCR-003 member_home.html
```

- `location_id`等はVirtualSessionの業務Contextとして保持される。
- URL・QR・VirtualSessionは画面遷移Contextであり、サーバー認可の根拠ではない。

## 2. 先生系

```text
SCR-002 teacher_home.html
  ├─ SCR-PAY-001 payment_teacher.html
  ├─ SCR-MEM-001 member_management.html
  ├─ SCR-EXAM-001 examination/index.html
  ├─ SCR-ATT-002 attendanceCheck.html
  ├─ SCR-ATT-003 teacher_attendance.html
  ├─ SCR-ATT-005 paper_attendance_review.html
  ├─ SCR-PAY-003 payment_status.html
  ├─ SCR-PAY-004 paymentEvidence.html
  ├─ SCR-QR-001 qr_generator.html
  ├─ 月次処理 #（遷移なし）
  └─ お知らせ #（遷移なし）
```

| 起点 | コードで確認した遷移先 |
|---|---|
| `payment_teacher.html` | `teacher_home.html`, `index.html` |
| `member_management.html` | `teacher_home.html`。一部Contextをクエリへ付与 |
| `examination/index.html` | `../teacher_home.html` |
| `attendanceCheck.html` | `teacher_home.html`, `index.html` |
| `teacher_attendance.html` | `teacher_home.html`, `index.html` |
| `paper_attendance_review.html` | `teacher_home.html`。Sessionの先生・道場Contextを付与 |
| `payment_status.html` | `teacher_home.html`, `payment_teacher.html` |
| `paymentEvidence.html` | `teacher_home.html` |
| `qr_generator.html` | `teacher_home.html`, `sheets/*` |

## 3. 会員系

```text
SCR-003 member_home.html
  ├─ SCR-ATT-001 attendance.html
  ├─ SCR-PAY-002 paypay_code.html
  ├─ SCR-ATT-004 attendance_summary.html
  ├─ 会費状況 #（遷移なし）
  └─ お知らせ #（遷移なし）
```

| 起点 | コードで確認した遷移先 |
|---|---|
| `member_home.html` | `attendance.html`, `paypay_code.html`, `attendance_summary.html`, `index.html` |
| `attendance.html` | `member_home.html`, `paypay_code.html`, `index.html` |
| `paypay_code.html` | `member_home.html` |
| `attendance_summary.html` | `member_home.html`。`member_id`を付与する場合あり |

## 4. QR出力

```text
SCR-QR-001 qr_generator.html
  ├─ OUT-QR-001 sheets/dojo.html
  ├─ OUT-QR-002 sheets/teacher.html
  ├─ OUT-QR-003 sheets/member-card.html
  ├─ OUT-QR-004 sheets/payment-monthly.html
  └─ OUT-QR-005 sheets/payment-onetime.html

各 sheets/* → ../qr_generator.html
```

出力先は種別とクエリから動的生成される。印刷リストのB5印刷は同一画面内DOMであり、必ずしも別HTML遷移ではない。

## 5. メニュー外・旧・管理画面

| 画面 | 確認できた入口・出口 | 状態 |
|---|---|---|
| `payment.html` | `teacher_home.html`と存在しない`home.html`へ戻る。現行メニュー入口なし | 旧画面。利用実態未確認 |
| `post_diagnostic.html` | 他画面リンクなし | 開発診断。入口未確認 |
| `time_travel.html` | `teacher_home.html?teacher_id=T001`へのリンク。先生ホームからリンクなし | 開発管理。配布入口未確認 |
| `gas/time_travel.html` | GAS配信内入口は未確認 | GAS別実装 |

## 6. Context継承の確認事項

- `virtual_session.js`は同一タブの`sessionStorage`に主体と業務Contextを保持する。
- 先生画面で読む会員QRは業務対象であり、先生主体を会員へ切り替えない設計である。
- `teacher_id`, `member_id`, `location_id`, `billing_block_id`は初期化・業務Scope決定に使われる。
- Firebase保護APIでは、画面Contextと別にID Tokenとサーバー認可が適用される。

## 7. 未確認

- 配布中の実QRが現在指すHosting/GAS URL。
- 旧画面、診断画面、GAS管理画面の正式入口。
- ブラウザ戻る、再読込、認証失効時の統一挙動。

## 8. 更新履歴

| 日付 | 内容 | 根拠 |
|---|---|---|
| 2026-10-19 | 24画面調査から、コードで確認できる遷移だけを初版保存 | `web/qr/**/*.html`, `virtual_session.js` |
