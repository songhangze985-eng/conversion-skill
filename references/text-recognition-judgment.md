# 文本识别评判（`text-recognition-judgment`）

本规范定义 `conversion-skill` 的**文本识别评判**体系，既用于知识转换产物的交稿把关，也支持对任意项目文档（如 `README.md`、说明手册、技术草稿）及整个仓库目录执行独立的 AI 痕迹、类比真实度与中文句法审查。

---

## 一、五维子能力定义

### 1. readme表达审查（`readme_expression_review`）

针对项目文档、说明页及转换稿件的宏观排版与修辞特征审查，满足以下任一条件即打上 `ai生产` 标签（否则标记为 `正常`）：

- **多表情元素（`emoji_overuse`）**：文档非代码区域累计出现不少于 3 处 Emoji 表情符号，或在标题行、列表项开头出现不少于 2 处装饰性图标。
- **分段严重且说明过于标准化（`severe_fragmentation && over_standardized`）**：正文自然段出现严重碎片化（单句短段占比达到 45% 以上，或平均段落不足 42 字），同时伴随高频模板套话或连续 3 项以上 `**四字词条**：说明` 式的标准化排比。

### 2. 词句关键破解（`micro_sentence_cracker`）

针对全文句末停顿、分句结构与修辞惯性的微观扫描，一旦命中即打上 `ai生产` 标签（否则标记为 `正常`）：

- **指令式两三字短句（`xian_bie_imperative`）**：捕获诸如 `先看看`、`先别急`、`别急`、`别慌`、`看好了`、`听我说` 等典型 AI 说教式短促指令（无论独立成句还是以逗号切分在句首）。
- **独立两三字短句（`standalone_short_sentence`）**：捕获由句号、叹号、问号或独立行界定的两字或三字孤立短句，阻断故作玄虚的短视频快餐文节奏。
- **设问自答过渡壳（`rhetorical_qna_shells`）**：捕获 `你可能会问`、`那么问题来了`、`这是为什么呢？原因在于`、`这意味着什么？这意味着` 等伪互动报幕壳。
- **对比排比成瘾（`negative_parallelism_matches`）**：识别单篇短文中高频重复（不少于 2 处）的 `不是……而是……`、`不在于……而在于……`、`不仅是一场……更是一次……` 机械排比句式。
- **伪金句空洞拔高（`hollow_epigrams`）**：拦截句末或文末 `这就是……的魅力所在`、`大道至简，……亦是如此`、`掌握了……的钥匙` 等脱离机制的空洞鸡汤收尾。

### 3. 语法识别（`grammar_inspection`）

针对中文自然语序与欧化翻译腔的句法诊断，自动定位以下五类语病并使用 Markdown 强调标记（`**...**`）提取高亮，同时给出符合中文母语习惯的改写建议：

- **主谓宾语序错误（`svo_order_error`）**：
  - 受事宾语前置越位：将「把/将 + 宾语」错误置于「通过/利用/借助 + 工具状语」之前（如把「通过正交变换把输入矩阵拆分」错写成「把输入矩阵通过正交变换拆分」）。
  - 虚化动词导致动宾颠倒：滥用「对……进行了……的……」或「实现了……的建立/解决」，把真正的谓语动词塞进定语后方。
- **英式思维倒装句表达（`anglicized_inversion`）**：
  - 条件与时间从句后置：将「当……的时候」「如果……的话」「一旦……时」等从句放在主句结果之后（违反中文「先条件后结果、先时间后动作」的语序规律）。
  - 限定框架与原因后置：将「对于……而言」「在……的情况下」「因为……的缘故」后置缀在句尾。
- **欧化长定语「的」字堆叠（`anglicized_de_stacking`）**：单分句内连续嵌套 3 个以上「的」字修饰同一中心名词，破坏中文短分句线性推进的呼吸感。
- **欧化被动句滥用（`anglicized_passive`）**：生硬套用英文 `be used to` / `be well solved` 被动句式（如 `可以被用来进行……`、`能够被很好地解决`）。
- **无生命名词复数「们」欧化滥用（`inanimate_plural_men`）**：对非拟人化的技术概念生硬缀加复数「们」（如 `节点们`、`参数们`、`数据包们`、`向量们`）。

### 4. 类比真实度与同构审查（`analogy_authenticity_review`）

直接服务于 `conversion-skill` 核心原则第 2 条（用整体生活场景承载机制，拒绝谐音造词式贴标签）：

- **贴标签式伪角色拦截（`sticker_label_terms`）**：识别将专业术语直接拼接人名/头衔后缀（如 `哈希先生`、`梯度队长`、`递归老师`、`注意力精灵`）或生硬音译（如 `皮沃特老师`、`帕克特小哥`）的假类比，命中即打上 `ai生产` 与 `伪类比贴标签` 标签。
- **映射元素落空检测（`ungrounded_story_elements`）**：核对四列映射表中的「类比元素」是否真实进入正文参与动作推进，防止映射表与正文「两张皮」。

### 5. 外行复述锚点评估（`layperson_retelling_anchor`）

直接服务于「把复杂知识讲到外行能顺畅复述」的核心目标：

- 自动从正文中筛选最具复述价值的「一句话白话机制锚点」（`best_anchor_sentence`），综合评估其覆盖的因果阶段数（触发、动作、约束、结果）、分句精炼度与去欧化程度，输出 `retellability_score`（0–100）。

### 6. 小白友好度与叙述边界审查（`beginner_friendliness` & `narrative_boundary_review`）

直接服务于零基础读者上手体验与「通俗易懂不是长篇大论讲故事」的叙述边界原则：

- **小白友好度（`beginner_friendliness`）**：拦截 `「其实很简单」`、`「显而易见」` 等居高临下词，检测前 45 字零黑话冷启动、小句平均字数（`<= 20` 字）与具象感官动作锚点。
- **叙述边界审查（`narrative_boundary_review`）**：识别正文中无机制增量的长篇故事环境或背景注水（如 `「在很久很久以前」`、`「阳光透过窗户洒在」`、`「端起一杯冒着热气的咖啡」`），命中即打上 `ai生产` 与 `长篇剧情注水` 标签，并统计游戏、日常、职场话术映射锚点。

---

## 二、与现有能力的联动适配

| 现有模块 | 适配方式与命令参数 |
|---|---|
| `scripts/hanlp-helper.ts` | 导出 `evaluateReadmeExpression`、`evaluateMicroSentenceCracker`、`evaluateGrammarInspection`、`evaluateAnalogyAuthenticity`、`evaluateLaypersonRetelling` 与汇总入口 `evaluateTextRecognitionJudgment` |
| `scripts/check-output.ts` | 输出结果默认携带 `text_recognition_judgment`；支持 `--text-judgment`、`--readme-review`、`--emit-grammar-marked <路径\|->` 以及批量目录扫描 `--scan-dir <目录路径>` |
| `scripts/check-output.ts --fix` | 自动剥离常见两三字指令短句，并将检出的英式倒装句、主谓宾语序错误、欧化被动句与无生命复数「们」重写为自然中文 |
| `scripts/validate-input.ts` | 开启 `--hanlp` 或 `--text-judgment` 时，在输入预检 JSON 中附加原材料的 `text_recognition_judgment` 诊断 |
| `scripts/run-evals.ts` | 离线评测基准内置五维子能力的正反例回归校验，确保准确率与零误报 |
