# conversion-skill

[![GitHub stars](https://img.shields.io/github/stars/songhangze985-eng/conversion-skill?style=flat)](https://github.com/songhangze985-eng/conversion-skill/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](LICENSE)
[![Optional runtime: Bun](https://img.shields.io/badge/optional%20runtime-Bun%20%3E%3D%201.1.0-fbf0df?logo=bun)](https://bun.sh/)

> **中文**：把难懂的论文、公式与系统机制，讲到外行也能准确复述。
>
> **English**: An [Agent Skill](https://agentskills.io) for turning dense technical knowledge into plain-language explanations without changing how the underlying mechanism works.

`conversion-skill` 不只是把术语换成口语。它先提取事实、关系与约束，再选择一个与原机制同构的叙事场景，最后用非故事化的知识点校验收尾。好懂不能靠删掉关键限制，好看也不能靠编造因果。

## 中文概览

- **先保真，后表达**：先建立事实清单，再决定比喻、故事或风格。
- **机制要对得上**：故事里的角色、规则和流程都要能映射回原概念。
- **默认短而完整**：正文默认不超过 800 字，结尾用 1–3 句严谨校验收束。
- **风格服务理解**：任何皮肤会导致失真时，立即降为中性说明。

适合“这篇论文看不懂”“这个公式太抽象”“请讲人话但别讲错”这类请求；不适合逐页逐句翻译、纯原创小说或只导出 PDF 原始文字。

## 适用范围 / What it is for

Use it when a reader says a formula, protocol, paper, mechanism, or operating procedure is too abstract and asks for an analogy, a story, or a plain-language explanation. Natural-language requests are enough; this release does not promise the legacy `/conversion` shortcut.

The core skill is portable Agent Skills Markdown. Optional local helpers require Bun and are useful for repeatable structure checks and PDF evaluation.

## 表达风格 / Expression styles

Anime remains the default. A user can request one of the following alternatives without changing the factual workflow.

| Style id | Chinese request | Best for | Boundary |
|---|---|---|---|
| `anime` | 二次元 / 轻度 / 中二 | General concepts and vivid scenes | Existing light, standard, and heavy intensity levels remain anime-only. |
| `detective` | 侦探推理 / 破案式 | Evidence, causes, hypotheses, probability updates | Do not invent guilt, motives, or evidence that is absent from the source. |
| `war-room` | 项目战情室 / 指挥室 | Coordination, protocols, workflows, changing relationships | Roles and alerts must represent real constraints, not replace them. |
| `nature-documentary` | 自然纪录片 / 观察镜头 | Time-space change, observation, and system dynamics | Keep causal rules explicit; atmosphere cannot become a substitute for explanation. |

All styles obey the same rule: when a scene cannot preserve the mechanism, lower the style intensity or use a neutral explanation instead of forcing a metaphor.

## 工作原理 / How the skill works

1. **Understand** — Restate the source and make assumptions visible.
2. **Extract facts** — List concepts, relationships, and constraints without adding or dropping any.
3. **Map mechanisms** — Give each key concept one story element and explain why the actions are isomorphic.
4. **Express** — Write one short, readable body in the selected style. The default body is at most 800 Chinese characters.
5. **Check** — Run the lay-reader gate, then add a 1–3 sentence factual verification in a non-story voice.

The analysis and mapping table stay folded in `<details>` so the reader sees one explanation first.

## 论文模式 / Academic-PDF navigation

For a readable research PDF, the skill does not try to paraphrase every page. It identifies the paper's central contribution from the title, abstract, method, and conclusion; records a temporary fact ledger with page anchors; and explains that contribution by default.

If the PDF contains several unrelated contributions, state the selected focus before writing. If the host cannot read the file reliably, ask for an abstract or selected pages instead of inventing missing facts. A large paper is therefore a navigation task, not an automatic refusal.

## 快速开始 / Quick start

Install the repository as a skill directory named `conversion-skill` so the directory and the YAML `name` match:

```powershell
git clone https://github.com/songhangze985-eng/conversion-skill.git
Copy-Item -Recurse conversion-skill "$env:USERPROFILE\\.codex\\skills\\conversion-skill"
```

For another Agent Skills host, copy the repository root into that host's skills directory with the same `conversion-skill` folder name. The important requirements are a visible `SKILL.md` and matching folder/metadata names.

安装后，直接用自然语言提出请求；不需要旧版 `/conversion` 指令：

```text
请用项目战情室的方式讲清楚这篇论文的核心贡献；保留关键约束，最后给知识点校验。

这个协议我看不懂。请用侦探推理式表达，告诉我每一步在验证什么，不要编造证据。

请把这个时空模型讲成自然纪录片；如果比喻会失真，就改用中性说明。
```

## 示例与输出 / Examples and output

无论选择什么表达方式，产物都遵循同一条清晰链路：

```text
理解请求 → 提炼事实与约束 → 概念—意象映射 → 风格化正文 → 知识点校验
```

读者默认先看到完整正文；分析过程和映射表收在 `<details>` 中，方便需要时核对而不打断阅读。风格只能改变叙事手段，不能改变事实、约束或校验段。

## 可选本地工具 / Optional local tools

The helper scripts are intentionally optional. They use Bun and TypeScript; PDF evaluation additionally installs `pdfjs-dist@5.6.205`.

```powershell
bun install

# Input routing and an empty five-step shell
bun run validate-input "贝叶斯定理 P(A|B)=P(B|A)P(A)/P(B)"
bun run generate-template --topic "快速排序" --style detective

# Check a completed conversion against its structure and temporary fact ledger
bun run check-output --file result.md --style detective --facts facts.json

# Prepare or grade a PDF only in an explicit temporary workspace
bun run evaluate-pdf --help
```

`evaluate-pdf` is a local evaluator, not the skill's prose generator. It extracts text with PDF.js, can render selected pages with Poppler, and checks that the supplied result and fact ledger stay in an isolated workspace. It never runs Git commands.

## 本地论文评测与隐私 / Local paper evaluation and privacy

For an acceptance run, export the skill to a temporary copy that excludes `.git`. Read source PDFs in place, keep extracted text, rendered pages, fact ledgers, conversion drafts, and grade cards only in that temporary directory, then remove it after reporting the verdict. Do not add PDFs, answers, screenshots, or paper-specific facts to this repository.

The score is four dimensions, two points each:

| Dimension | Full-score requirement |
|---|---|
| 能懂 | An outsider can restate the mechanism in one plain sentence. |
| 保真 | The factual check and story preserve the source mechanism and constraints. |
| 同构 | Every ledger fact has an explicit, non-colliding mapping. |
| 表达不挡懂 | The chosen expression is memorable without adding jargon or unsupported drama. |

Only an 8/8 result, complete fact coverage, a passing structural check, and a clean temporary-workspace check count as acceptance. Preparation, rendering, and structural validation are timed separately from model prose generation.

### 质量标准 / Quality bar

| 维度 | 满分要求 |
|---|---|
| 能懂 | 外行能用一句大白话复述机制。 |
| 保真 | 没有无依据补充、遗漏关键约束或机制反转。 |
| 同构 | 每个关键事实都有明确、不冲突的映射。 |
| 表达不挡懂 | 风格增强记忆，不增加黑话或戏剧化噪音。 |

严格 PDF 验收不会因为“有表格”或“有校验段”就判定通过：事实清单中的每个 ID 都必须同时出现在映射表与知识点校验中。`evaluate-pdf` 只在仓库外、无 `.git` 的空临时目录写入测试产物，验收完成后应删除这些材料。

## 项目结构 / Repository layout

```text
conversion-skill/
├── SKILL.md                    # Triggering and five-step workflow
├── references/                 # Mapping, gate, paper navigation, and styles
├── assets/templates/           # Folded-analysis output shells
├── scripts/                    # Optional Bun/TypeScript local helpers
└── evals/                      # Generic rubric and trigger examples only
```

The repository deliberately contains no research-paper fixture, generated paper explanation, or scoring report.

## 贡献与反馈 / Contributing and support

欢迎通过 [Issues](https://github.com/songhangze985-eng/conversion-skill/issues) 反馈问题或提出改进建议。高价值反馈请包含：

1. 可公开的最小输入片段或概念描述；
2. 读者最终应能复述的机制；
3. 哪一处失真、难懂，或风格压过了机制。

提交前请不要加入私密论文、凭据、生成答案或临时评测产物。工具改动可先运行 `bun install --frozen-lockfile` 及对应的本地检查。

## 常见问题 / FAQ

**Does a special style change the facts?**
No. Style only changes how the mechanism is staged. Facts, constraints, and the verification paragraph remain source-grounded.

**What if anime is not appropriate?**
Request `侦探推理`、`项目战情室`、`自然纪录片`, or ask for a neutral explanation. The default never overrides reader preference.

**Why is the paper not explained page by page?**
The skill focuses on the paper's central contribution so a reader can understand and repeat it. It makes the chosen focus explicit and retains page anchors in temporary analysis.

**Does local evaluation upload anything?**
No. The evaluator works from a copy with no `.git` directory and never invokes `git add`, `commit`, `push`, or remote operations.

## License / 开源许可

[MIT](LICENSE)
