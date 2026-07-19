# Architecture Index

STATUS: 作成中
TYPE: INDEX
AREA: ARCHITECTURE

TAG: INDEX
TAG: ARCH

---

# 概要

Architecture文書一覧。

本プロジェクトの設計方針、命名規約、状態遷移などを管理する。

---

<!-- REALITYSYNC:ARCH_INDEX:BEGIN -->

|No|タイトル|STATUS|概要|
|---|---|---|---|
|ARCH-000|システム開発の基本サイクル|UNKNOWN||
|ARCH-001|サービス構成|作成中||
|ARCH-002|（タイトル未取得）|UNKNOWN||
|ARCH-003|Runner設計|作成中||
|ARCH-004|Payment ⇔ Attendance対応表|作成中||
|ARCH-005|状態遷移|作成中||
|ARCH-006|Business Process標準モデル|作成中||
|ARCH-007|（タイトル未取得）|UNKNOWN||
|ARCH-008|システム内用語辞書（System Internal Dictionary）|検討中||
|ARCH-009|データアクセスアーキテクチャ|検討中||
|ARCH-010|（タイトル未取得）|UNKNOWN||
|ARCH-011|（タイトル未取得）|UNKNOWN||
|ARCH-012|Framework Maintenance|ACTIVE||

<!-- REALITYSYNC:ARCH_INDEX:END -->

---

# 更新ルール

Architectureを追加・変更した場合は、
プロジェクトルートで次を実行する。

```powershell
dojo sync arch
```

Pythonを直接利用する場合：

```powershell
python dojo.py sync arch
```

RealitySyncの自動生成範囲は手動編集しない。
番号の欠番は許容し、削除ではなくSTATUS変更で管理する。

---

# 関連文書

PROJECT_METADATA.md
