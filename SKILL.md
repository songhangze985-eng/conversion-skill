---
name: conversion-skill
description: "把晦涩的专业知识或可读取的学术论文，转换成普通读者能复述的短解释，并保留可核对的概念—意象映射与事实校验。默认使用二次元轻小说表达；也适用于用户明确要求侦探推理、项目战情室或自然纪录片表达。论文先建立带页码锚点的临时事实清单，再解释核心贡献。Use whenever the user says 看不懂、太抽象、讲人话、用比喻/故事讲清楚、老妪能解，或 asks for a mechanism-preserving explanation of a formula, protocol, system, or academic paper. NOT FOR raw PDF text extraction, one-line ELI5 without a mapping, original fiction, translation, meeting-note summarization, or code review."
license: MIT
compatibility: "Core workflow is host-agnostic. Optional local validation and paper navigation require Bun >=1.1; PDF extraction additionally uses the bundled pdfjs-dist dependency."
metadata:
  author: songhangze985-eng
  version: "2.0.0"
---

# conversion-skill

把「读了好几遍还不懂」的专业知识，变成能念给外行听、听完能复述的短解释。表达方式是服务知识的皮肤：事实优先于好看，听得懂优先于口癖，机制同构优先于表面像。

## When to Use

用户要的是把难知识讲懂，并保留可核对的映射时使用本技能。即使用户没说「转换」，看不懂、太抽象、讲人话、比喻、故事、老妪能解，以及「解释这篇论文的核心贡献」都走本流程。

**Not for:** 只要一句话且不要映射；原创新小说或续写；画图；中英互译；会议纪要；代码审查；只想从 PDF 导出原始文字。误触发时停下，改走宿主默认能力，不硬套本技能。

## 核心约束

1. 先建立事实清单，再选叙事；不为风格补写原文没有的因果、数据或结论。
2. 每个关键概念有稳定的故事元素，机制步骤与输入/输出可逐步对照。
3. 第一次出现的必要术语先用动作解释；读者应能说出「它在干什么、受什么约束、看走眼会怎样」。
4. 任一风格无法保留上述对应关系时，降为中性说明，而不是强行套皮肤。

## 资源路由

| 何时 | 读取或运行 |
|---|---|
| 第 3 步选意象或检查同构 | `references/mapping-principles.md` |
| 第 4 步选择表达方式 | `references/style-selector.md`，再只读选中风格的文件 |
| 默认二次元 | `references/style-anime.md`；角色不够用再读 `assets/templates/character-archetypes.md` |
| 侦探推理 / 项目战情室 / 自然纪录片 | 分别读 `references/style-detective.md`、`references/style-war-room.md`、`references/style-nature-documentary.md` |
| 可读取的学术论文或 PDF | `references/paper-navigation.md` |
| 写完正文、过通用门禁前 | `references/lao-yu-gate.md` |
| 卡文、催更、万字或无法读取的超大文件 | `references/author-voice.md`，只用表内原句 |
| 想对照写法 | `references/domain-examples.md` |
| 用户明确要长篇 | `references/long-article-engine.md` |
| 排版 | `assets/templates/article-output-template.md` |
| 需要空白骨架 | `bun run generate-template -- -t "<知识点>" -s <style> -l <default|expand|long>` |
| 输入分类 | `bun run validate-input -- "<输入>"`；标准输入用 `-` |
| 交稿前结构自检 | `bun run check-output -- <result.md> --level <default|expand|long> --style <style> [--facts <绝对临时事实清单.json>]` |
| 本地论文评测 | `bun run evaluate-pdf -- <pdf-path> --style <style> --workspace <绝对、空、无 .git 的临时目录> [--render]` |

情况回复只住在 `author-voice.md`；映射原则只住在 `mapping-principles.md`；风格细节只住在各自风格文件；门禁规则只住在 `lao-yu-gate.md`。不要把这些规则复制进正文。

## 工作流

按顺序做。第 1–3 步与门禁草稿放进 `<details>`；用户第一眼只看到一篇正文与知识点校验。

### 0. 论文导航（仅论文输入）

先读 `references/paper-navigation.md`。从题目、摘要、方法、结论建立**临时**事实清单，并为每条事实记下页码锚点。事实清单与锚点只能留在折叠分析或仓库外的临时评测目录；默认只解释论文的核心贡献，不把整篇论文改写成故事。

文本层不可读、页码内容与抽取文本矛盾、或资料不足以确定关键机制时，说明缺口并请用户指定页码或提供可读文本；不得猜测。可读取的学术论文不因全文较长而直接拒绝。

### 1. 理解

用自己的话复述请求的范围；标出最难点与必要假设。对论文，范围默认是「核心贡献」；用户点名某节、某张图或某个结论时，以该范围为准。

### 2. 提炼

列出概念、关系、顺序与约束，组成后续校验用的事实清单。不增不减。含公式时，先用大白话说清公式在做什么，再拆变量与条件。

### 3. 意象映射

每个关键概念对应一个故事元素。形似不够，机制必须同构；约束要变成可见规则。输出一张「知识概念｜故事元素｜对应理由」表；细则读 `references/mapping-principles.md`。

### 4. 转换

先按 `references/style-selector.md` 确定表达方式，默认 `anime`。所选风格只决定怎么演，不改变事实清单、映射表或门禁。

| 篇幅档 | 何时 | 正文长度 |
|---|---|---|
| `default` | 未声明 | **≤800 字** |
| `expand` | 用户说详细一点、再展开、写成篇 | 800–2500 字 |
| `long` | 用户明确要连载或长文 | 不靠字数充深度；先读 `author-voice.md` |

点名一万字、专业长文或逐页全量改写时，按 `author-voice.md` 先做情况回复，再给可执行的降档选择。论文的「核心贡献」导航不属于逐页全量改写。

### 5. 通用可懂门禁

读 `references/lao-yu-gate.md`，按它改到能过关，再写「知识点校验」：1–3 句严谨复述事实清单，不使用故事腔。这个门禁对所有风格都相同。

## 输出骨架

使用 `assets/templates/article-output-template.md`。标题下必须有：

```markdown
> 表达风格：`<anime|detective|war-room|nature-documentary|neutral>`
> 篇幅：`<default|expand|long>`
```

结构为：折叠分析（理解、事实清单、映射、风格选择、门禁自检）→ 一篇正文 → 知识点校验。论文事实清单与页码锚点只能留在折叠分析或临时评测；正常交稿只有在用户要求来源时才展示锚点。

## 输入边界

- 空输入或纯闲聊：请用户给一段要转换的知识；不要回「封禁中」。技术主题中的日常词（例如天气）不能单独当作闲聊证据。
- 可读取学术论文：走论文导航；默认抓核心贡献，不能因全文体积而拒绝。
- 无法读取的文件、或要求逐页逐句全量改写：按 `author-voice.md` 回应，并请用户圈定范围或提供文本。
- 操作步骤类：保留可执行清单，不融进闯关剧情；表达方式默认选轻度或中性。
- 默认中文；用户声明其他语言再切换。

## 反向修正

用户说没懂或有错时：回到事实清单定位节点 → 修正映射 → 只重写受影响的正文片段 → 再过门禁。不要用更浓的风格掩盖错误。

## Verification

交稿前确认：

- [ ] 分析在 `<details>` 内；正文只出现一次。
- [ ] 映射表三列齐全，每条约束都有对应规则。
- [ ] 所有关键事实均在正文或知识点校验中被保留；论文事实都有临时页码锚点。严格论文评测中，每个 `[F#]` 同时出现在映射表与知识点校验。
- [ ] 标题下的 `> 表达风格：` 与 `> 篇幅：` 标识正确；正文落在当前篇幅档。
- [ ] 外行能用一句大白话复述机制；知识点校验 1–3 句且不是故事腔。
- [ ] 有 Bun 时运行 `bun run check-output -- <result.md> --level <level> --style <style> [--facts <绝对临时事实清单.json>]`，结论为 PASS。

**Success:** 外行能复述机制；校验段与事实清单一致；映射可逐步对照；表达没有增加理解门槛。
**Failure:** 听完仍要回到原文，故事把机制讲反，或风格掩盖了约束。

## Common Rationalizations

| 借口 | 事实 |
|---|---|
| 映射表可以省，故事里都有了 | 反向修正与同构校验都靠表；没有表就没有证据。 |
| 我已经懂了，门禁可以跳 | 门禁是念给外行听，不是给作者听。 |
| 论文太长，只能拒绝 | 先导航核心贡献；只有不可读或逐页全量改写才需要缩小范围。 |
| 更像侦探 / 战情室 / 纪录片就更好 | 风格无法逐步对应机制时，降为中性说明。 |
| 黑话更有味道 | 味道挡懂就是门禁失败；降浓度，不用黑话换正确性。 |
| 操作步骤编成闯关更有趣 | 步骤必须保留可执行清单。 |
| 本地论文评测结果可以写进 Skill | 评测产物只放绝对临时目录，不能进入技能、Git 或交稿正文。 |

## Red Flags

- 正文前铺着未折叠的分析步骤，或同一篇文章贴了两遍。
- 没有映射表；一格塞多个无关概念；或只形似、不神似。
- 术语解释术语；约束只藏在括号里；故事用无依据的反转代替机制。
- 将 `author-voice.md` 的情况句写进正文或知识点校验。
- 把可读论文当作超大文件直接拒绝，或把不可靠的 PDF 抽取当作事实。
- 把本地测试的论文、文本、截图、评分卡写入最终 Skill。
