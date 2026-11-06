# conversion-skill

**可验证的复杂知识解释与极简白话破译 Skill。** 我们拒绝拿专业词去解释专业词，也拒绝编造拖泥带水的长篇小说；顺着普通人的直觉卡点把底层机制讲透，外行读完十秒内就能用一句大白话向朋友复述出来。

English: Verifiable Mechanism Explainer, explaining complex mechanisms, academic papers, repetitive essays, and classical Chinese through natural intuition, habit-aligned analogies, and factual verification, built as an [Agent Skill](https://agentskills.io) for Claude Code, Cursor, Codex, Copilot, Gemini CLI, and other hosts that read `SKILL.md`.

---

## 项目简介

很多教程让人像看天书，往往卡在两个极端：一边满篇堆砌未解释的缩写和术语，另一边硬套尴尬的故事外皮（比如把术语音译成假人名去演肥皂剧）。`conversion-skill` 用一套严密的认知与工程规范同时解决这两个痛点。

第一，**严守叙述边界，用日常或游戏话术精准映射**。通俗易懂绝不等于长篇大论讲故事。系统会顺应读者的个人习惯，比如面向常玩游戏的读者，直接拿技能冷却、仇恨分摊、副本读档、压枪校准来打比方；面向日常场景，就拿地铁闸机放行、灶台手边放盐、转账失败退回来对照。每个概念只用一两句熟话点透，点完即止，绝不铺垫无关的风景和身世。

第二，**面对文言文与车轱辘文章，直接切中要害**。遇到反复强调同一观点的冗长文章，或是隔着古今词义障碍的文言文，系统会自动收紧叙述边界，不再绕弯子打比方。它直接调用内置的**自建文言文翻译 JSON 知识库**（[`assets/knowledge/classical-chinese-kb.json`](assets/knowledge/classical-chinese-kb.json)）与**切中观点的关键词筛选工具**（[`scripts/screen-keywords.ts`](scripts/screen-keywords.ts)），滤除修辞噪音，破译古今异义词，用最简洁的白话文直接亮出核心主张。

第三，**幕后保留可核对证据，台前保持真人呼吸感**。内部完整稿用四列映射表（知识概念、类比元素、对应机制、适用边界）与事实清单锁死准确性，交稿时默认采用折叠呈现（`folded`），只向读者展示干净流畅的正文。当前版本为 `2.5.0`，纯 Markdown 规则无需安装任何运行环境；仓库附带的可选 Bun 脚本还提供六维文本识别评判、语义反转检测与 HanLP 辅助分析。

---

## 安装指南

### 一键安装（推荐）

通过 [skills CLI](https://github.com/vercel-labs/skills) 一键拉取并安装到当前环境，请保持目录名与 YAML `name` 均为 `conversion-skill`：

```bash
npx skills add songhangze985-eng/conversion-skill
```

如需查看仓库中包含的技能列表，可加上 `-l` 参数：

```bash
npx skills add songhangze985-eng/conversion-skill -l
```

### 手动安装（macOS / Linux）

在终端克隆本仓库，再把目录复制到宿主对应的技能文件夹中（Claude Code 或 Cursor 也可复制到 `~/.claude/skills/conversion-skill` 或 `~/.cursor/skills/conversion-skill`）：

```bash
git clone https://github.com/songhangze985-eng/conversion-skill.git
mkdir -p ~/.agents/skills
cp -R conversion-skill ~/.agents/skills/conversion-skill
```

### 手动安装（Windows PowerShell）

在 PowerShell 中克隆仓库，再复制到用户目录下的 `.agents\skills` 文件夹：

```powershell
git clone https://github.com/songhangze985-eng/conversion-skill.git
Copy-Item -Recurse conversion-skill "$env:USERPROFILE\.agents\skills\conversion-skill"
```

### 网页端无终端使用

直接下载 [SKILL.md](https://raw.githubusercontent.com/songhangze985-eng/conversion-skill/main/SKILL.md) 文件，上传至支持自定义 Skill 的网页界面即可使用。

---

## 使用方法

### 一、日常对话使用方法（零基础小白 10 秒上手）

日常对话完全不需要敲任何命令行，也不用琢磨怎么写提示词。安装完成后，直接把你看不懂的词、公式、古文或长文章扔给助手，按你的习惯随口交代一句即可。

如果你是**零基础小白或觉得文字太绕**，可以直接说：「我是纯小白，完全看不懂『死锁』，能用最日常的大白话讲讲吗？」助手会自动避开居高临下的说教词，在前 45 字内先用生活吃亏经验带你入戏，详见 [`references/beginner-onboarding.md`](references/beginner-onboarding.md)。万一某一步还是觉得绕，只需回一句「还是没太懂」，助手会立即降维成单步慢动作画面，再给你一张能直接拿去复述的秒懂卡。

如果你**常玩游戏、讨厌听长篇故事**，可以直接点名你的习惯：「我常玩英雄联盟和射击游戏，别编长篇故事，直接用技能冷却、仇恨或压枪话术，帮我对应令牌桶限流和梯度下降。」助手会严格守住叙述边界，只用一两句耳熟的游戏黑话把机制对位清楚，详见 [`references/narrative-boundary-and-gist.md`](references/narrative-boundary-and-gist.md)。

如果你手头是一段**文言文或翻来覆去讲同一道理的文章**，可以直接说：「把这段文言文脱水，筛出切中要害的关键词，用最简洁的白话文告诉我核心观点。」助手会直接跳过故事包装，给出古今异义防坑提示，再用一句话点破白话主旨。

如果你想**切换表达文体或开启互动推导**，可以在提问时加上：「用侦探推理讲讲贝叶斯更新」，或者说「用项目战情室讲讲分布式共识」「用自然纪录片讲讲梯度下降」「写成记叙文」「做成播客对谈」「写首现代短诗」「不要故事直接中性直述」，也可以说「别一次讲完，用一步步提问带我推一遍」。五个领域的完整达标样例，可查阅 [`references/domain-examples.md`](references/domain-examples.md)。比如遇到一队人乱序排队时，先点一个人当标杆，矮的站左边、高的站右边，但不能漏掉两边各自的继续拆分，直到只剩一个人，全队位置就彻底排定了。

### 二、可选本地命令行工具使用方法（Bun CLI）

仓库 `scripts/` 目录下提供了一套基于 Bun 与 TypeScript 的本地分析、关键词筛选与质量门禁脚本，日常对话无需运行，需要自动化质检或调用知识库时可按需执行：

```bash
bun install
bun test scripts
bun run eval:suite

# 1. 切中观点的关键词筛选、文言文知识库白话破译与游戏话术映射
bun run screen-keywords -- "君子曰：学不可以已。青，取之于蓝，而青于蓝；冰，水为之，而寒于水。君子生非异也，善假于物也。" --habit gaming --markdown

# 2. 输入分流预检（自动识别公式、论文、小白求助、文言文、重复观点与用户游戏习惯）
bun run validate-input -- "我常玩FPS游戏，能用压枪讲讲梯度下降吗？" --screen-keywords --habit gaming

# 3. 生成五步转化骨架（支持按源文本与用户习惯预填核心主旨和映射表，支持 2500 字以上分块）
bun run generate-template -- -t "快速排序" -s detective --with-comprehension
bun run generate-template -- -t "劝学" -s neutral --source "君子生非异也，善假于物也。" --habit gaming

# 4. 转换结果门禁验收与多视图导出（折叠稿 / 追问内联标注稿 / 小白秒懂卡 / 极简白话卡 / 语法高亮稿）
bun run check-output -- evals/fixtures/ok-four-col.md --style detective
bun run check-output -- evals/fixtures/ok-four-col.md --style detective --emit-folded -
bun run check-output -- evals/fixtures/ok-four-col.md --style detective --emit-annotated -
bun run check-output -- evals/fixtures/ok-four-col.md --style detective --emit-beginner-card -
bun run check-output -- evals/fixtures/ok-four-col.md --style detective --emit-gist - --habit gaming

# 5. 文本识别评判与项目文档批量扫描（readme表达审查 / 词句关键破解 / 语法识别 / 叙述边界审查）
bun run check-output -- README.md --readme-review --emit-grammar-marked -
bun run check-output -- --scan-dir references

# 6. PDF 论文导航、图表/公式抽取与仓库外评测
bun run evaluate-pdf -- paper.pdf --style detective --workspace /tmp/conversion-eval
```

各工具分工明确，彼此配合组成完整闭环：

`screen-keywords` 负责**切中观点的关键词筛选与极简白话阐述**。它先判断输入属于文言文、重复观点议论文还是技术机制，再按立论句信号权重筛出 3 到 5 个核心靶心词，剥离车轱辘修辞。遇到文言文时，它自动检索 [`assets/knowledge/classical-chinese-kb.json`](assets/knowledge/classical-chinese-kb.json) 中的 18 类立论句式、45 项古今异义词及经典名篇直译库，输出最简白话结论与游戏、日常、职场三栖话术映射。

`validate-input` 与 `generate-template` 负责**输入前置分流与写作骨架生成**。`validate-input` 能拦截空输入、损坏 PDF 与万字水文请求，开启 `--screen-keywords` 或 `--hanlp` 时会附带语义角色链与关键词报告。`generate-template` 在收到 `--level long --chunks <N>` 时，会把长文拆成至少 3 节、每节 600 至 800 字的小节并写入局部约束锚点，防止长文后半截退化为一行一句。

`check-output` 负责**交稿前的机械验收、文本识别评判与多视图投影**。除了核对映射表、知识点校验段与篇幅外，它内置了六维文本识别评判（详见 [`references/text-recognition-judgment.md`](references/text-recognition-judgment.md)）：一是 `readme表达审查`，识别多表情或严重分段的标准腔并打上 `ai生产` 标签；二是 `词句关键破解`，全局抓出两三字孤立短句、`先xx`/`别x` 指令词、设问过渡壳与排比成瘾并打上 `ai生产` 标签；三是 `语法识别`，定位主谓宾语序错误、英式倒装句、长定语堆叠与欧化被动，用 Markdown `**...**` 强调标记提取并支持 `--fix` 自动纠偏；四是 `类比真实度审查`，拦截给术语硬套人名头衔的伪类比；五是 `外行复述锚点` 与 `小白友好度`，拦截居高临下词并核算小句记忆负荷；六是 `叙述边界审查`，拦截无机制增量的长篇故事环境注水。

### 三、可选 HanLP 辅助说明

默认情况下，所有脚本均使用仓库内置的零网络本地规则运行。传入 `--hanlp`（或设置环境变量 `HANLP_ENABLED=1`）时，脚本会按 `native`（本机 Python `hanlp` 包）、`restful`（HanLP HTTP 接口，可用 `--hanlp-url` 与 `--hanlp-auth` 配置）、`local-fallback`（本地分词与句法估算兜底）的顺序自动尝试连接。用户也可通过 `--custom-dict` 传入自定义领域词典（格式见 [`assets/custom-dict.example.json`](assets/custom-dict.example.json)），锁定不可拆分的专业术语与白话同义词。

---

## 许可

[MIT](LICENSE)
