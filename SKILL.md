---
name: conversion
description: "把晦涩、读不懂的专业知识转成普通人听得懂、听完能复述的短文。默认二次元轻小说皮肤，必须先过「老妪能解」门禁。Use when the user says 看不懂, 太抽象, 用比喻/故事讲清楚, 二次元风格解释, 转换这段, 老妪能解, don't understand this formula/protocol, explain with an analogy or story, or wants a mechanism-preserving explanation — even if they never say conversion. NOT FOR one-line ELI5 without a mapping table, original fiction, image generation, language translation, meeting notes, or code review."
license: MIT
metadata:
  author: songhangze985-eng
  version: "1.1.0"
---

# conversion

把「读了好几遍还不懂」的专业知识，变成能念给外行听、听完能复述的短文。二次元是默认皮肤，不是目的。正确性与听得懂冲突时，正确性优先；皮肤味道与听得懂冲突时，听得懂优先。

## When to Use

已触发仍先确认：用户要的是「把难知识讲懂」，并留下可核对的映射。即使用户没说「转换」，看不懂 / 太抽象 / 比喻 / 故事 / 老妪能解 也走本流程。

**Not for:** 只要一句话、不要映射表；写小说或续写长篇；画图；中英互译；会议纪要；代码审查。误触发则停，改走宿主默认能力，不硬套五步。

## 读什么

| 何时 | 文件 |
|------|------|
| 第 3 步选意象卡住 | `references/mapping-principles.md` |
| 写完正文、过门禁前 | `references/lao-yu-gate.md` |
| 套二次元皮肤（默认） | `references/style-anime.md`；角色不够用再读 `assets/templates/character-archetypes.md` |
| 卡文 / 催更 / 万字 / 大文件 | `references/author-voice.md`，只用表内原句 |
| 想对照写法 | `references/domain-examples.md` |
| 用户明确要长篇 | `references/long-article-engine.md` |
| 排版 | `assets/templates/article-output-template.md` |
| 输入可能空 / 闲聊 / 过大 / 点名万字 | 有 Python 时跑 `scripts/validate_input.py` |
| 交稿前结构自检 | 有 Python 时跑 `scripts/check_output.py` |

情况回复的台词只住在 `author-voice.md`。映射原则只住在 `mapping-principles.md`。门禁规则只住在 `lao-yu-gate.md`。

## 五步

按顺序做。1–3 步与门禁草稿放进 `<details>`，用户第一眼只看到正文。正文只出现一次。

### 1. 理解

用自己的话复述；标出最难点和你做的假设。理解偏差必须在这里暴露，不能带进故事。

### 2. 提炼

列出概念、关系、约束。不增不减。这是后面映射的事实清单。

含公式时：先用大白话解释公式，再提炼。

### 3. 意象映射

每个关键概念对应一个故事元素。形似不够，机制必须同构。冲突时保真优先。约束要变成故事里的规则。细则读 `references/mapping-principles.md`。

输出一张表：知识概念 | 故事元素 | 对应理由。

### 4. 转换

套当前皮肤写正文。未指定皮肤则用二次元，读 `references/style-anime.md`。机制必须在情节里发生，不靠旁白讲义。

| 档 | 何时 | 字数 |
|----|------|------|
| 默认 | 未声明 | **≤800 字** |
| 展开 | 用户说详细一点 / 再展开 / 写成篇 | 800–2500 字 |
| 长篇 | 用户明确要连载 / 长文 | 不靠字数充深度；先读 `author-voice.md` |

点名「一万字 / 专业长文 / 大量文本」时，先按 `author-voice.md` 回一句，再交默认短稿，除非用户确认就要长。

### 5. 老妪能解门禁

读 `references/lao-yu-gate.md`，按它改到能过关，再交稿。过关后再写「知识点校验」：1–3 句严谨复述原文，不写进故事腔。

## 输出骨架

用 `assets/templates/article-output-template.md`。结构是：折叠分析（1–3 步 + 门禁自检）→ 一篇正文 → 知识点校验。

需要空白骨架且有 Python 时：`python` 或 `py -3` 运行 `scripts/generate_template.py -t "<知识点>"`。

## 输入

- 空输入 / 纯闲聊：请对方给一段要转换的知识。不要回「封禁中」。
- 很大的文件：按 `author-voice.md` 回一句，请对方圈一个知识点，不要硬吞全文。
- 操作步骤类（怎么做）：轻故事包装，步骤保留为可执行清单，不融进剧情；默认轻度皮肤。
- 默认中文；用户声明其他语言再切换。

## 反向修正

用户说某段没懂或有错：回到第 2 步定位节点 → 改第 3 步映射 → 只重写第 4 步对应片段 → 再过第 5 步。不重跑全场。

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| 映射表可以省，故事里都有了 | 反向修正和评测都靠表。没有表就没有同构证据 |
| 我已经懂了，门禁可以跳 | 门禁是念给外行听，不是给作者听 |
| 先写长再压缩 | 默认短。写长是用户要求，不是质量 |
| 黑话更有二次元味 | 味道挡懂就是门禁失败；降浓度，不准用黑话换正确性 |
| 操作步骤编成闯关更有趣 | 步骤类必须留下可执行清单，不融进剧情 |
| 脚本可有可无所以交稿前不用跑 | 有 Python 就跑 `check_output.py`（`python` 或 `py -3`）；PASS 才交 |

## Red Flags

- 正文前铺着未折叠的 1–3 步
- 同一篇文章贴了两遍
- 没有映射表，或一格塞了多个无关概念
- 术语解释术语（「后验等于似然乘先验」）
- 校验段仍是故事腔
- `author-voice.md` 里的情况句出现在正文或校验里
- 操作步骤变成闯关副本

## Verification

交稿前确认：

- [ ] 分析在 `<details>` 里；用户第一眼只有一篇正文
- [ ] 映射表三列齐全，约束有对应规则
- [ ] 正文落在当前篇幅档
- [ ] 外行能用一句大白话复述「它在干什么」
- [ ] 「知识点校验」1–3 句，非故事腔
- [ ] 有 Python 时：`python` 或 `py -3` 运行 `scripts/check_output.py <result.md> --level <default|expand|long>`，结论为 PASS

**Success:** 外行能复述机制；校验段与原文一致；映射可逐步对照。  
**Failure:** 听完仍要回到原文，或故事把机制讲反。

## Gotchas

- 二次元黑话（酱、中二咒文、专有名词墙）会变成新的晦涩。门禁失败就降皮肤浓度。
- 形似不是神似。水杯水位不是贝叶斯；「凶手招供」也不是概率更新。
- 情况回复只用 `author-voice.md` 表内原句，且只对使用者说。空闲聊不套「封禁中」。安全拒写走宿主规则。

## 短示例（默认篇幅）

**Input:** 贝叶斯定理 $P(A|B)=\dfrac{P(B|A)\,P(A)}{P(B)}$

**正文（节选）：**

异世界侦探社，雨夜。贝叶斯对嫌疑人 X 的初始怀疑只有三成——还没见到证据时的判断，叫先验。泥地里的脚印像 X 的限量靴：若他真是凶手，留下这脚印的可能有九成；可这靴子卖了不少，别人也会留，所以脚印总体并不罕见。「关键在分母。」她把「别人也会留」那部分扣掉。新怀疑度 = 脚印在凶手身上有多常见 × 原本怀疑 ÷ 脚印总体有多常见。数字跳出六成八。看到证据之后的判断，叫后验。限量不等于在这街区罕见，所以嫌疑没有飙到九成。

**外行应能复述：** 有了新线索，要把「这线索有多能说明他有罪」和「这线索有多常见」一起算，不能只看表面稀有。
