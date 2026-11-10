# conversion-skill

**可验证的复杂知识解释与极简白话破译 Skill。** 我们拒绝拿专业词去解释专业词，也拒绝编造拖泥带水的长篇小说；顺着普通人的直觉卡点把底层机制讲透，外行读完十秒内就能用一句大白话向朋友复述出来。

English: Verifiable Mechanism Explainer (v3.0), explaining complex mechanisms, academic papers, repetitive essays, and classical Chinese through one-shot intuitive grounding, habit-aligned analogies, world-author stylistic simulation, and factual verification, built as an [Agent Skill](https://agentskills.io) for Claude Code, Cursor, Codex, Copilot, Gemini CLI, and Web Chat hosts.

---

## 项目简介

很多教程让人像看天书，往往卡在两个极端：一边满篇堆砌未解释的缩写和术语，另一边硬套尴尬的故事外皮（比如把术语音译成假人名去演肥皂剧，或者先弹三轮调查问卷才肯给出一句解释）。`conversion-skill` `3.0.0` 用一套精简渐进的认知与工程规范同时解决这些痛点。

第一，**首轮秒懂直出，按路由优先级严守叙述边界**。通俗易懂绝不等于长篇大论编故事。系统建立了清晰的默认路由层级：遇到文言文或翻来覆去讲同一道理的文章，直接启用 `neutral` 极简直述脱水破译；遇到日常概念提问，首轮直接给出切中要害的大白话与习惯话术对位（如拿《王者荣耀》《原神》《无畏契约》《文明6》等 12 款热门游戏的冷却、韧性条、经济局机制，或地铁闸机放行、职场甩锅热梗来对照），点透即止；只有当读者需要深度机制叙事或选择写故事时，才启用 8 大文体或仿真鲁迅、王小波、刘慈欣、古龙、金庸、张爱玲、刘震云等 19 位世界知名作家的笔法围绕当前概念全新创作。

第二，**四大结构化 JSON 知识库与文言一词多义语境消歧**。仓库内置游戏机制设定库（[`assets/knowledge/gaming-kb.json`](assets/knowledge/gaming-kb.json)）、网络热梗与日常话术库（[`assets/knowledge/life-memes-kb.json`](assets/knowledge/life-memes-kb.json)）、文言文信达雅破译库（[`assets/knowledge/classical-chinese-kb.json`](assets/knowledge/classical-chinese-kb.json)，涵盖 30 类虚词句式、80 余项古今异义词、30 篇经典名篇及「假、绝、信、兵、走、去」一词多义上下文消歧规则）以及知名作家笔法库（[`assets/knowledge/story-authors-kb.json`](assets/knowledge/story-authors-kb.json)）。所有知识库查询均输出结构化目标概念槽位卡（`StyleSpecCard`），遇到库外游戏或作家时诚实保留原名动态同构映射，绝不静默冒名顶替或复读静态标本。

第三，**幕后保留可核对证据，台前保持真人呼吸感与文体感知门禁**。主提示词 `SKILL.md` 采用渐进式披露架构压缩至 130 余行，大幅降低上下文占用；内部完整稿用四列映射表（知识概念、类比元素、对应机制、适用边界）锁死动态因果同构，默认折叠交稿只呈现清爽正文。可选 Bun 工具链支持单次管线秒级调用、纯 Web 零死链独立打包、双栏学术 PDF 坐标重排以及区分冷峻短句文学与 AI 碎段套话的作家档位门禁。

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

### 网页端无终端使用（支持零死链独立版导出）

直接下载 [SKILL.md](https://raw.githubusercontent.com/songhangze985-eng/conversion-skill/main/SKILL.md) 上传至网页端即可使用；若网页端无法读取仓库子目录，可在本地运行 `bun run pipeline -- --bundle-web dist-web-skill.md` 生成自动内联四大知识库精华、剥离全部本地路径依赖的纯 Web 独立单文件版本。

---

## 使用方法

### 一、日常对话使用方法（零基础小白 10 秒上手）

日常对话完全不需要敲任何命令行，也不用琢磨怎么写提示词。安装完成后，直接把你看不懂的词、公式、古文或长文章扔给助手，首轮即可拿到直击要害的白话解释。

如果你是**零基础小白或觉得文字太绕**，可以直接说：「我是纯小白，完全看不懂『死锁』，能用最日常的大白话讲讲吗？」助手会自动避开居高临下的说教词，在前 45 字内先用生活吃亏经验带你入戏，详见 [`references/beginner-onboarding.md`](references/beginner-onboarding.md)。万一某一步还是觉得绕，只需回一句「还是没太懂」，助手会立即降维成单步慢动作画面，再给你一张能直接拿去复述的秒懂卡。

如果你**常玩游戏或想用网络热梗秒懂机制**，可以直接说：「用【王者荣耀】的理解方式打开令牌桶限流」，或者直接点名具体热梗「用草台班子和甩锅讲讲异常冒泡」，详见 [`references/narrative-boundary-and-gist.md`](references/narrative-boundary-and-gist.md) 与 [`references/interactive-pipeline-examples.md`](references/interactive-pipeline-examples.md)。

如果你手头是一段**文言文或翻来覆去讲同一道理的文章**，可以直接发给助手。系统会自动区分「乃悟前狼假寐」（假装）与「善假于物」（借助）这类一词多义陷阱，给出古今异义防坑提示，再用一句话点破白话主旨。

如果你想**仿真知名作家写故事或切换表达文体**，可以在提问时说：「仿真古龙的写法讲讲分布式死锁」「用王小波的笔法讲讲过拟合」「用项目战情室讲讲分布式共识」或「用一步步提问带我推一遍」。五个领域的完整达标样例，可查阅 [`references/domain-examples.md`](references/domain-examples.md)。

### 二、可选本地命令行工具使用方法（Bun CLI）

仓库 `scripts/` 目录提供了一体化单次管线与专项质检脚本，日常对话无需运行，需要自动化流水线、知识库检索或文稿门禁验收时可按需执行：

```bash
bun install
bun test
bun run eval:suite --deterministic

# 1. v3.0 一体化单次管线（单进程 <30ms 完成输入路由 + 知识库槽位提取 + 首轮秒懂直出 + 可选门禁校验）
bun run pipeline -- "两阶段提交协议中协调者宕机导致参与者阻塞" --game 王者荣耀 --json
bun run pipeline -- "乃悟前狼假寐，盖以诱敌。" --json
bun run pipeline -- --bundle-web /tmp/conversion-skill-web.md

# 2. 切中观点的关键词筛选、文言文语境消歧与游戏/热梗/名家规约卡检索
bun run screen-keywords -- "君子曰：学不可以已。青，取之于蓝，而青于蓝；冰，水为之，而寒于水。君子生非异也，善假于物也。" --habit gaming --markdown

# 3. 转换结果门禁验收、作家文体豁免档位与多视图导出
bun run check-output -- evals/fixtures/ok-four-col.md --style detective
bun run check-output -- story.md --style narrative --author-profile 古龙 --strict-human-voice --baseline-floor
bun run check-output -- README.md --readme-review --emit-grammar-marked -
bun run check-output -- --scan-dir references

# 4. 双栏学术 PDF 坐标重排导航、公式字形预警与仓库外评测
bun run evaluate-pdf -- paper.pdf --style war-room --workspace /tmp/conversion-eval
```

各工具分工明确，既可通过 `pipeline` 一键串联，也可独立运行：

`pipeline` 与 `screen-keywords` 负责**前置路由、语境消歧与结构化槽位预填**。它们识别文言文、重复观点议论文、公式与学术论文，检索四大 JSON 知识库并输出带 `target_concept_slots` 的规格卡，同时提供 `--bundle-web` 为纯网页端宿主编译无死链独立提示词。

`check-output` 与 `evaluate-pdf` 负责**文体感知门禁验收与双栏学术文献解析**。`check-output` 内置六维文本识别评判（详见 [`references/text-recognition-judgment.md`](references/text-recognition-judgment.md)），拦截多表情标准腔、两三字孤立祈使短句、欧化倒装句、假人名伪类比以及静态名词画等号的非同构映射表，并通过 `--author-profile` 为古龙、海明威等冷峻短句名家及鲁迅、王小波等辩证杂文名家提供精准文体豁免。`evaluate-pdf` 支持双栏学术 PDF 的 `(x, y)` 坐标阅读序还原、连字与断行连字符修复、乱码公式字形预警以及非标准编号核心方法章节的回退定位。

### 三、可选 HanLP 辅助说明

默认情况下，所有脚本均使用仓库内置的零网络本地规则运行。传入 `--hanlp`（或设置环境变量 `HANLP_ENABLED=1`）时，脚本会按 `native`（本机 Python `hanlp` 包）、`restful`（HanLP HTTP 接口，可用 `--hanlp-url` 与 `--hanlp-auth` 配置）、`local-fallback`（本地分词与句法估算兜底）的顺序自动尝试连接。用户也可通过 `--custom-dict` 传入自定义领域词典（格式见 [`assets/custom-dict.example.json`](assets/custom-dict.example.json)），锁定不可拆分的专业术语与白话同义词。

---

## 许可

[MIT](LICENSE)
