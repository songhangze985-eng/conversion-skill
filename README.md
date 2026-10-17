# conversion-skill

**可验证的复杂知识解释 Skill。** 把拗口的公式、协议、论文或系统机制，转化为普通人顺着直觉就能听懂、读完能用自己话复述的清晰解释——同时让每一个比喻都有据可查、有边界可核对。

English: Mechanism Explainer — explain complex mechanisms through natural intuition, traceable analogies, and factual verification. Built as an [Agent Skill](https://agentskills.io) for Claude Code, Cursor, Codex, Copilot, Gemini CLI, and other hosts that read `SKILL.md`.

很多解释之所以让人看不懂，要么是因为「用术语解释术语」，要么是因为「硬套一层尴尬的故事外皮（比如把术语直接音译成人名去报幕）」。`conversion-skill` 采用**「先抓认知卡点 → 再搭同构场景 → 自然叙事展开 → 严谨事实校验」**的转化思路，支持轻快叙事（默认）、侦探推理、项目战情室、自然纪录片、记叙文、播客对谈、现代短诗与中性直述。

核心能力完全由纯 Markdown 驱动，日常使用无需安装 Bun、TypeScript 或 Python。当前 Skill 版本是 `2.4.0`。可选脚本可以接上 [HanLP](https://github.com/hankcs/HanLP) 做术语、语义角色和可读性辅助；不传 `--hanlp` 时，这些脚本仍走原来的本地规则，也不会访问网络。

```bash
npx skills add songhangze985-eng/conversion-skill
```

安装后直接对助手说「帮我理解快速排序的运行原理」或「用侦探推理讲讲贝叶斯更新」即可。请保持目录名与 YAML `name` 均为 `conversion-skill`。

## 转化效果示例

以下样例来自仓库内的标准示范（[references/domain-examples.md](references/domain-examples.md)），展示如何从干瘪的定义转化为自然、有画面感且严守机制边界的解释。

**原始输入**

快速排序（Quicksort）：选一个基准值（pivot），比它小的放左边，比它大的放右边，然后对左右两边递归执行同样的过程。

**转化正文（日常场景叙事）**

体测排队，体育老师想让三十个高矮不一的学生按身高从矮到高站好。如果让大家两两比身高挪位置，场面很快就乱成一锅粥。

老师换了个办法：随手点名排头的阿杰站出来当「标杆」。所有人只跟阿杰一个人比——比阿杰矮的统统站到他左手边，比他高的统统站到他右手边。

这一轮比完，神奇的事情发生了：虽然左右两拨人内部还是乱的，但阿杰自己的最终名次已经彻底锁死了——左边绝没有人比他高，右边也绝没有人比他矮，他往两拨人中间一站，这辈子都不用再挪窝。

接下来，左右两拨人各自再点一个新标杆，照着同一个规矩继续对半分。哪一拨分到只剩一个人，不用比也知道排好了，自然停下。至于最开始点谁当标杆？其实点谁都不会排错名次，顶多是运气不好点到了最矮或最高的人，得多分几轮、慢一点而已。

**概念映射（内部完整稿核对表）**

| 知识概念 | 类比元素 | 对应机制 | 适用边界 |
|---|---|---|---|
| 基准值（Pivot） | 被点出来当标杆的阿杰 | 作为本轮唯一比较基准，将人群一分为二 | 选谁当标杆只影响分队轮数（效率），不影响最终排队结果（正确性） |
| 分区（Partition） | 比他矮站左边、比他高站右边 | 所有元素仅与基准比较并归入左右子集 | 拆开后的左右两拨内部此时还没排好序，不能当成已经排完 |
| Pivot 位置锁定 | 阿杰站定中间、后续不再挪窝 | 分区完成后，基准元素已处于全局最终位置 | 锁定的是标杆自己的位置，不是左右两侧人的位置 |
| 递归（Recursion） | 左右两拨各自再选新标杆重复分队 | 对左右子区间独立应用同一套分区规则 | 左右两拨人之间永远不需要再跨组比较 |
| 递归终止条件 | 分到只剩一个人时自然停下 | 子区间长度 ≤ 1 时停止继续拆分 | 不能无限拆分下去 |

**知识点校验**

快速排序每轮选定一个基准值（pivot）进行分区，小者居左、大者居右；分区结束后该基准值的全局最终位置即被锁定，随后对左右两个子区间递归执行相同操作，直至子区间长度 ≤ 1 时终止。基准值的选择仅影响时间复杂度，不影响排序结果的正确性。

## 安装指南

### 一键安装（推荐）

通过 [skills CLI](https://github.com/vercel-labs/skills) 一键拉取并安装到当前环境：

```bash
npx skills add songhangze985-eng/conversion-skill
```

如需查看仓库中包含的技能列表：

```bash
npx skills add songhangze985-eng/conversion-skill -l
```

### 手动安装（macOS / Linux）

```bash
git clone https://github.com/songhangze985-eng/conversion-skill.git
mkdir -p ~/.agents/skills
cp -R conversion-skill ~/.agents/skills/conversion-skill
```

（Claude Code、Cursor 等宿主也可直接复制到 `~/.claude/skills/conversion-skill` 或 `~/.cursor/skills/conversion-skill`。）

### 手动安装（Windows PowerShell）

```powershell
git clone https://github.com/songhangze985-eng/conversion-skill.git
Copy-Item -Recurse conversion-skill "$env:USERPROFILE\.agents\skills\conversion-skill"
```

### 网页端无终端使用

直接下载 [SKILL.md](https://raw.githubusercontent.com/songhangze985-eng/conversion-skill/main/SKILL.md) 并上传至支持自定义 Skill 的 Web 界面即可。

## 如何使用

安装后直接用自然语言提问即可触发，例如：

- 「帮我理解快速排序的运行原理。」
- 「用侦探破案的方式讲讲贝叶斯定理，顺便说说这个比喻在哪儿会失效。」
- 「用播客对谈的形式聊聊 TCP 三次握手为什么不能只握两次。」
- 「用通俗的话解释这篇论文的核心贡献，保留它的前提限制。」

如果你想指定表达方式，可以在提问中带上：「用侦探推理」「用项目战情室」「用自然纪录片」「写成一篇记叙文」「做成播客对谈」「写首现代短诗」或「不要故事，直接用中性大白话讲清楚」。

## 可选本地校验工具（Bun）

仓库 `scripts/` 目录下提供了用于本地结构检查与评测的 TypeScript 工具。日常对话不用运行它们。

```bash
bun install
bun test scripts
bun run validate-input -- "贝叶斯定理 P(A|B)=P(B|A)P(A)/P(B)"
bun run generate-template -- -t "快速排序" -s detective --with-comprehension
bun run check-output -- evals/fixtures/ok-four-col.md --style detective
bun run evaluate-pdf -- paper.pdf --style detective --workspace /tmp/conversion-eval
```

`evaluate-pdf` 只在仓库外的临时目录里准备论文导航和事实草稿，不会生成解释正文，也不会把产物写进仓库。

### 可选 HanLP 辅助

`--hanlp` 才启用辅助分析。它按这个顺序尝试：

1. `native`：本机 Python 包 `hanlp`，经 `scripts/hanlp_bridge.py` 调用。仓库不附带这个包。
2. `restful`：请求 HanLP HTTP 接口，默认 `https://www.hanlp.com/api`。地址和密钥可用 `--hanlp-url`、`--hanlp-auth`，或环境变量 `HANLP_API_URL`、`HANLP_AUTH`。
3. `local-fallback`：接口和本地模型都不可用时，用仓库内的分词、术语和句法估算继续跑完。

可用 `--hanlp-mode restful|native|local-fallback` 指定一层。`HANLP_ENABLED=1` 等同于打开 `--hanlp`；`--no-hanlp` 可以关掉它。

```bash
bun run validate-input -- "快速排序每次选一个基准值。" --hanlp --hanlp-mode local-fallback
bun run generate-template -- -t "快速排序" --source "选一个基准，小的放左，大的放右，再递归。" --hanlp
bun run check-output -- evals/fixtures/ok-four-col.md --style detective --hanlp
```

打开辅助之后，各脚本额外做这些事：

- `validate-input` 在原有分流之外，附加句子数、关键短语、实体、语义角色链和句法深度。
- `generate-template` 用 `--source` 预填事实骨架和映射表的「知识概念」列。不传 `--source` 时，骨架与原来一致。`--level long --chunks <N>` 把正文拆成至少 3 节、默认 4 节，每节标题下留一行局部约束注释，目标 600–800 字。`default` 和 `expand` 的骨架不变。
- `check-output` 附加可读性分数、过深长句、未在映射表铺垫的术语，以及人味诊断（单句成段率、非人名「·」、列表占比、句长节奏、套话）。机械结论字段保持不变；只有打开 `--hanlp` 时，语义质量才会标成 `HANLP_ASSISTED_PASS` 或 `HANLP_ASSISTED_WARN`。再加上 `--strict-human-voice` 后，单句成段率超过 35%、非人名「·」达到 2 处，或人味分数低于 70，总结论改为 `FAIL`。`--baseline-floor` 再用段落、圆点、因果链、映射边界和校验字数做最低表达水平线。`--chunk <k|all>` 对每个二级标题单独验收，任一块失败则总结论为 `FAIL`；不传 `--chunk` 时，原有结论不变。`--deterministic` 把人类可读结果收成一行，JSON 键序固定。`--fix` 会在落盘前去掉套话前缀和行首圆点，并合并过短段落。这仍然不是「读者已经听懂」的证明。本地兜底的可读性分数会标明 `local_heuristic_estimate`，和 HanLP 依存分析不是同一件事。
- `evaluate-pdf --deterministic` 的清单里不再写入耗时。
- `evaluate-pdf --hanlp` 把导航页里抽出的术语写进 `fact-ledger.draft.json`。这份清单仍是草稿，核验前不能当作已确认事实。

领域词可以放进 JSON，并用 `--custom-dict` 传入。示例见 [assets/custom-dict.example.json](assets/custom-dict.example.json)，里面有 `force`、`combine` 和白话同义词。`--sts-threshold`、`--max-dep-depth` 只在 `check-output --hanlp` 时参与语义相似度和长句预警。

## 许可

[MIT](LICENSE)
