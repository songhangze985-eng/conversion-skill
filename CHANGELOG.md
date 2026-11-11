# Changelog

## 3.0.0 — 2026-11-11

- 版本升至 `3.0.0`。`SKILL.md` 改为渐进披露，多轮范例移到 `references/interactive-pipeline-examples.md`。未指定文体时默认 `neutral`；点名深度叙事时才启用故事载体（可指定 `anime` 等皮肤，扭曲机制则回退 `neutral`）。
- 新增单次管线 `scripts/pipeline.ts`（`bun run pipeline`，含 `--bundle-web`）。
- 新增 `gaming-kb.json`（12 款游戏）、`life-memes-kb.json`、`story-authors-kb.json`（19 位作家），并扩充 `classical-chinese-kb.json` 的一词多义消歧（假、绝、信、兵、走、去）。
- 门禁按作家档位放宽：`--author-profile 古龙/海明威/契诃夫` 豁免段落下限，`鲁迅/王小波/刘震云` 豁免合理反讽对照。`evaluate-pdf` 增加双栏坐标阅读序。

## 2.5.0 — 2026-11-07

- 新增**叙述边界设定、自建文言文翻译 JSON 知识库与切中观点的关键词筛选工具**（`references/narrative-boundary-and-gist.md`、`assets/knowledge/classical-chinese-kb.json`、`scripts/screen-keywords.ts`）：
  - **叙述边界铁律与日常/游戏话术类比映射**：明确通俗易懂不是长篇大论编故事，而是根据用户日常习惯（如 `gaming` 游戏玩家习惯：技能冷却 `CD`、仇恨分摊、副本读档、压枪灵敏度、`LRU` 快捷物品栏；`daily` 日常生活；`workplace` 职场协作）用 1–2 句日常话术精准映射；在 `hanlp-helper.ts` 中新增 `evaluateNarrativeBoundary`，拦截无机制增量的长篇故事环境注水并打上 `长篇剧情注水` 标签。
  - **自建文言文翻译 JSON 知识库**（`assets/knowledge/classical-chinese-kb.json`）：内置 18 类高频文言立论/判断/被动/反诘句式（带立论信号权重）、45+ 核心文言实词与古今异义防坑词典（如 `劝`、`假`、`卑鄙`、`痛恨`、`牺牲`、`所以`、`虽然`）及 15 篇经典名篇极简白话直译与三栖话术映射。
  - **切中观点的关键词筛选工具**（`bun run screen-keywords`）：自动区分文言文、重复强调观点的车轱辘文章与常规技术机制，剥离修辞噪音，提取复合靶心关键词，并用最简洁的白话文向读者直述核心要害；联动支持 `validate-input --screen-keywords`、`generate-template --habit` 与 `check-output --emit-gist -`。
- 新增**零基础小白认知无障碍与一秒读懂卡**（`references/beginner-onboarding.md`、`evaluateBeginnerFriendliness`、`projectBeginnerCard`）：
  - 确立开口零门槛、情绪零羞辱（拦截 `其实很简单`/`显而易见` 等 11 类居高临下词）、前 45 字零黑话冷启动、小句工作记忆防爆仓（均长 `<= 20` 字）与「还是没太懂」三级降维追问梯，支持 `check-output --emit-beginner-card -` 导出小白秒懂卡。
- 新增**六维文本识别评判**（`evaluateTextRecognitionJudgment` 与 `references/text-recognition-judgment.md`）并支持 `--scan-dir` 目录批量扫描：
  - **readme表达审查**（`evaluateReadmeExpression`）：识别项目文件或说明文档中多表情元素，或分段严重且说明过于标准化的表达，自动打上 `ai生产` 标签；支持 `check-output --readme-review` 直接对项目 `README.md` 执行审查。
  - **词句关键破解**（`evaluateMicroSentenceCracker`）：全局检索两字或三字独立短句（如 `先看看`、`别急` 等指令式表达）、设问自答过渡壳、高频「不是…而是…」排比成瘾与伪金句收尾，自动打上 `ai生产` 标签。
  - **语法识别**（`evaluateGrammarInspection`）：检测主谓宾语序错误、英式思维倒装句、欧化长定语「的」字堆叠、欧化弱被动与无生命复数「们」，使用 Markdown 强调标记（`**...**`）提取高亮并支持 `--emit-grammar-marked` 导出与 `--fix` 自动纠偏。
  - **类比真实度审查与外行复述锚点**（`evaluateAnalogyAuthenticity`、`evaluateLaypersonRetelling`）：拦截「术语+人名头衔」式伪类比，自动提取一句话白话复述锚点。
- 新增语义极性与方向反转核查（`evaluateClaimFidelity`）：识别与事实主张字面高度重合但否定必要条件或反转方向（如「相反 vs 相同」「大于零 vs 等于零」「不可涂改 vs 可以涂改」）的错误转化，防止字面重叠分虚高。
- 打通 `folded` 交稿与完整稿校验的工程闭环：`check-output` 新增 `--emit-folded <path|->` 与 `--emit-annotated <path|->`，在完整稿通过门禁后直接导出纯净读者正文或带 `〔知识概念〕对应机制。适用边界。` 的追问内联标注视图。
- 消除标杆样例的「填空式嵌词腔」：扩充 `evaluateExpressionBaseline` 的自然因果衔接识别，重写 `references/domain-examples.md` 五则标杆正文，在保持 100% 严格门禁通过的同时恢复自然叙事呼吸感。
- 新增 `references/visual-interactive.md`（同构 Mermaid 状态/时序图与可交互探索微件规范）与 `references/socratic-microstep.md`（苏格拉底微步自适应教学规程），并在 `check-output` 中支持 Mermaid 语法校验。
- 升级 `evaluate-pdf.ts`：支持带编号的自定义学术章节标题识别、自适应章节证据窗口，并自动抽取论文中的图表说明（Figure/Table）、算法伪代码块（Algorithm）与编号公式（Equation）。
- 新增 `scripts/run-evals.ts`（`bun run eval:suite`）：内置 24 项离线确定性基准套件（覆盖 C01–C12、V01–V03、五则标杆样例、对抗性极性反转与可视化门禁），并支持 `--live` 模式在仓库外独立运行 A/B/C 三组盲测与 Judge 评分。

## 2.4.0 — 2026-10-17

- 2500 字以上改为分块生成和逐块验收，避免后半篇被全文平均分盖过。
- `generate-template --level long --chunks` 输出带局部约束锚点的小节骨架。默认 4 节，至少 3 节，每节目标 600–800 字。
- `check-output --chunk` 对每个二级标题单独套用人味和可读性底线。未传该开关时，原有机械结论不变。
- `--deterministic` 把校验输出收成稳定的一行；PDF 评测清单在该开关下不再写入耗时。

## 2.2.0 — 未发布

- 新增呈现设定 `folded`，并设为默认交稿。回复只有标题和正文。用户明确要求展开完整稿时，才交出内部骨架。
- 理解、事实清单和门禁自检不出现在该回复里。四列映射留在内部完整稿；用户追问时，在文中对应句后标注概念、机制和适用边界，不另贴映射表。
- 内部完整稿与 `check-output` 的通过条件不变。检查对象仍是完整稿，不是剥掉分析后的回复。
- 新增三种可选表达：`verse`（诗篇）、`narrative`（记叙文）、`podcast`（播客对谈）。未点名时默认仍是 `anime`。
- 诗篇补上写作工作流。反复必须转意，不把同一句原样贴三次。写法取李白的字第二次加重、杜甫的下句另起一物、莎士比亚同一短语第二次换对象。也可以从推特公开帖吸收：只收可执行的一句并记下链接；检索不到就不编帖子。
- 记叙文按封存的对照条改写工作流：可以先写结果再回到起因；正文里的事情顺序那句用括号标明清单、环境暗示和对话，外行复述这一整句。叙述情绪名全文一次，与清单相反则删掉。
- 播客对谈按已定四句改写工作流：一句开场，一次只问一个问题，回答先说动作再带名字，「为什么停」只由提问的人问，第三人全文一句。不使用记叙文的括号复述句。

## 2.1.0 — 2026-09-17

产品化改造，保留 v2.0 的核心转换能力、四种表达风格和已公开的脚本接口。

- 把产品定位收成「可验证的复杂知识解释」，二次元改为可选皮肤，不在未做对照评测前改默认风格。
- README 改为先给可核对样例和安装入口；写明 `npx skills add` 的实际验证结果，并区分 Markdown Skill 与可选 Bun 工具。
- 事实清单要求区分原文事实、必要推导、理解用类比和尚未确认信息；映射表支持适用边界。
- 新增可选理解检验：默认关闭，需要时只出一道复述题和一道迁移题。
- `check-output` 分开报告结构检查、术语/ID 覆盖、语义质量和理解验证；后两项不会因为表格存在而自动 PASS。
- 增加 A/B/C 对照评测框架和 12 道公开题目。本版本没有填写模型对照分数。
- 补充 CONTRIBUTING、Issue / PR 模板和本 Changelog。

## 2.0.0

当前 GitHub `main` 在 2.1 之前的公开版本：YAML 名为 `conversion-skill`，可选工具改为 Bun/TypeScript，并已包含侦探、战情室、纪录片风格与论文页码锚点。更早的 Python 脚本和 `name: conversion` 只存在于旧提交，不再作为安装路径。
