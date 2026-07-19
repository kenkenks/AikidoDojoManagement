# Framework Principles

Framework 全体で共有する設計・実装・保守の判断原則を定義する。

原則は仕様ではない。
仕様が不足したとき、責務境界が曖昧になったとき、複数の実装案から選択するときの判断軸である。

---

## FP-001 Reality First

判断の起点は Reality とする。

コード、実行結果、設定、ファイル、運用状態を観測してから設計との差分を判断する。
理想から現実を推測しない。

---

## FP-002 Responsibility First

構造を決める前に責務を特定する。

```text
Fact
  ↓
Responsibility
  ↓
Unit OR Chimera
```

クラス、モジュール、関数、文書の境界は、責務の境界に合わせる。

---

## FP-003 Unit Has One Reason to Change

Unit は、一つの責務と一つの主な変更理由を持つ。

Scanner は取得する。
Parser は Model へ変換する。
Validator は判定する。
Generator は成果物を生成する。
CLI は Engine を呼び出す。

責務を越えた処理を便利さだけで追加しない。

---

## FP-004 Chimera Is Temporary

複数の責務が混在した Chimera は、移行途中の一時状態としてのみ許容する。

恒久利用すると、次の問題を生む。

・責務境界の崩壊
・Reality の不明瞭化
・原因不明の不具合
・変更影響範囲の拡大
・人と AI の理解コスト増大

Chimera を発見した場合は、即時に大改修するのではなく、事実、責務、分割候補、移行手順を記録する。

---

## FP-005 CLI First

すべての保守機能は CLI から利用可能にする。

GUI、VS Code、AI、CI は CLI を利用する。
CLI 以外にのみ存在する機能を作らない。

---

## FP-006 Engine First

業務処理と保守処理は、UI や CLI から独立した Engine として実装する。

入口は薄く保ち、判断と処理は Engine に置く。

---

## FP-007 Parser Before Generator

生成処理より先に、Reality を Model へ変換する規則を定義する。

Generator が原文を直接解析しない。
Generator は検証済み Model を入力とする。

---

## FP-008 Do Not Guess Missing Facts

取得できない事実を推測で補完しない。

不足は `UNKNOWN`、`WARNING`、`ERROR` として明示する。
自動同期は、確認できた Reality の範囲でのみ行う。

---

## FP-009 Idempotent Automation

同じ Reality に対して同じコマンドを繰り返した場合、二回目以降は差分を生まない。

自動生成領域と手動編集領域を明確に分離する。

---

## FP-010 Human Judgment Remains Explicit

命名、抽象化、責務分割、設計意図、運用判断など、人の判断を必要とする領域を AUTO に偽装しない。

AI の提案と確定判断を区別し、MANUAL の責務を残す。
