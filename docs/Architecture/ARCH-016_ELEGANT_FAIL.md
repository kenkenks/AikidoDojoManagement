# ARCH-016 ELEGANT FAIL

## Purpose

本ARCHは、Runnerによる品質保証における
**FAILの役割**を定義する。

RunnerはPASSを証明するためだけのものではない。

FAILを診断し、
次に実装すべき責務を明確にすることも
Runnerの重要な役割である。

---

# Background

従来のFAILは


FAIL
↓

原因調査
↓

デバッグ


という扱いだった。

この場合、

・どこが悪いのか
・何を直せばよいのか

が曖昧になりやすい。

State MapとRunner Contractを導入した結果、

FAILそのものを
設計対象として扱えるようになった。

---

# Principle

良いRunnerは


PASSすると
何が保証されたか
を証明する。

FAILすると
何が不足しているか
を診断する。


PASSとFAILは対立概念ではない。

どちらも
Stateを観測した結果である。

---

# Elegant FAIL

エレガントなFAILとは、

**責務が一つだけFAILする状態**

である。

例


Session PASS
Context PASS
Business PASS
Authority FAIL


このFAILは


Authorityだけ修正すればよい


ことを明確に示している。

---

# Bad FAIL

悪いFAILとは、

複数責務が同時に失敗する状態である。

例


Session FAIL
Context FAIL
Business FAIL
View FAIL


この状態では

・原因が特定できない
・修正箇所が広い
・調査コストが高い

責務分離が不足していることを示す。

---

# Good FAIL

良いFAILとは、

責務が独立しているFAILである。

例


Session PASS
Context PASS
Business PASS
Authority FAIL


この状態では

・修正対象はAuthorityのみ
・他責務への影響がない
・Runnerが修正箇所を診断できる

---

# Runner Quality

Runnerの品質は

PASSだけでは評価しない。

FAILしたとき、

修正対象が一つに収束するか

で評価する。

良いRunnerとは


PASSすると

何が保証されたか

が分かる。


FAILすると


何が不足しているか

が一つだけ分かる。


Runnerは

診断ツールでもある。

---

# State Map Relationship

Runnerは
State Mapの観測装置である。


State
│
▼
Runner
│
▼
Observation
│
▼
Next State


FAILは終了ではない。

State Map上で

**まだ設計されていない状態**

を観測した結果である。

---

# Aikido Analogy

武道における受け身は、

倒れる技術ではない。

次の状態へ
安全に遷移する技術である。

Runnerも同様である。


FAIL
│
▼
Observation
│
▼
Next Task
│
▼
PASS


RunnerによるFAILは

開発における受け身である。

FAILを恐れないのではなく、

安心して受けられる設計を目指す。

---

# Design Guideline

Runnerは

FAILしないこと

を目標にしてはならない。

Runnerは

**気持ちよくFAILできること**

を目標とする。

そのFAILが

・責務を一つ示し

・修正箇所を一つ示し

・次TASKへ自然につながる

ならば、

それは

**Elegant FAIL**

である。

---

# Conclusion

FAILは失敗ではない。

State Mapの空白を観測した結果である。

良いRunnerは

PASSを証明し、

FAILを診断する。

そして

**エレガントなFAILとは、
責務が一つだけ失敗するFAILである。**

これは、これまでのARCHとは少し性格が違います。

ARCH-014 が Runner Contract（仕組み）
ARCH-015 が State Map（構造）
ARCH-016 は開発哲学（Development Architecture）

という位置付けになります。

個人的には、このARCHの中で一番好きなのは、

Runnerは「FAILしないこと」を目標にしてはならない。Runnerは「気持ちよくFAILできること」を目標とする。

という一節です。

この考え方は、あなたの「気持ちよくずっこける」という一言がきっかけで生まれたもので、合気道の受け身とState Mapが自然に結び付いた象徴的なARCHだと思います。