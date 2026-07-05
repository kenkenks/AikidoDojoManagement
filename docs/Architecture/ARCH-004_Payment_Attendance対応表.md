# ARCH-004 Payment ⇔ Attendance対応表

STATUS: 作成中
TYPE: ARCHITECTURE
AREA: COMMON
PRIORITY: HIGH

TAG: ARCH
TAG: PAYMENT
TAG: ATTENDANCE
TAG: SERVICE

---

# 1. 目的

Paymentサービスで採用している業務処理モデルを整理し、
Attendanceサービスへ適用するための対応表を定義する。

本書は、Attendanceをサービス構成の基準モデルとして整備し、
将来的にPayment系へ再適用するための設計資料とする。

---

# 2. 背景

AttendanceではStory・Runnerを中心とした開発方式(RDD)を採用している。

一方、Paymentでは、

collect

make

record

post

という業務処理単位を採用している。

両者は目的が異なるため、
直接置き換えるものではなく、
責務を対応付けて整理する。

---

# 3. 基本思想

```text
Story
↓
Runner
↓
Service
↓
Business Process
↓
Core
↓
Sheet
```

Business Process が

collect

make

record

post

である。

---

# 4. Paymentモデル

```text
collect
↓
必要情報取得

make
↓
登録データ生成

record
↓
受付・仮登録

post
↓
正式反映
```

---

# 5. Attendanceモデル

```text
collect
↓
会員・稽古枠・出席状況取得

make
↓
出席DTO生成

record
↓
確認待ち登録

post
↓
先生確認による確定
```

---

# 6. 対応表

| Payment | Attendance | 内容 |
|---------|------------|------|
| collect | collect | 必要情報取得 |
| make | make | 登録DTO生成 |
| record | record | 確認待ち登録 |
| post | post | 確認済へ更新 |

---

# 7. STORY-001対応

| Story | Process |
|--------|---------|
| Step03 | collect |
| Step04 | make + record |
| Step06 | post |

---

# 8. Serviceとの関係

Business Processは、
Service内部で利用する。

例)

```text
attendanceMember...
↓
collect
↓
make
↓
record
```

先生側

```text
attendanceTeacher...

↓

post
```

---

# 9. Coreとの関係

Business ProcessはCoreを利用する。

```text
record
↓
attendanceCore...
↓

07_出席ログ
```

---

# 10. 適用方針

本規約はAttendanceを基準モデルとして整備する。

Paymentについては、
Payment Story作成後、
Attendanceで確立した構成へ合わせて整理する。

---

# 11. 注意事項

collect / make / record / post は、

業務処理段階

である。

Runner

Prepare

Execute

Verify

Summary

とは別レイヤーの概念である。

混同しないこと。

---

# 12. 今後の予定

TASK-DEV-012

Attendance整理
↓
Runner確認
↓
Payment Story作成
↓
Paymentへ適用

---

# 13. 関連文書

ARCH-001 サービス構成

ARCH-002 命名規約

ARCH-003 Runner設計

TASK-DEV-012 Attendanceサービス構成・命名規約整理


| 仮想クラス                    | GASファイル                    | 主な関数                                                                                       |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| AttendanceMemberService  | 04_AttendanceMember.js     | attendanceMemberRegisterBatch()<br>attendanceMemberGetRegistrationState()                  |
| AttendanceTeacherService | 04_AttendanceTeacher.js    | attendanceTeacherPendingList()<br>attendanceTeacherConfirm()                               |
| AttendanceCore           | 04_AttendanceCore.js       | attendanceCoreRegisterBatch_()<br>attendanceCoreFindRows_()<br>attendanceCoreUpdateRows_() |
| AttendanceRepository（将来） | 04_AttendanceRepository.js | readAttendanceRows_()<br>appendAttendanceRows_()<br>updateAttendanceRows_()                |
| AttendanceRunner         | sup_runner_Attendance.js   | runner_story_attendance_001()                                                              |
