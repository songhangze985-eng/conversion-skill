# conversion-skill

> An [Agent Skill](https://agentskills.io) for turning dense technical knowledge into an explanation an ordinary reader can repeat correctly.

`conversion-skill` does not merely simplify wording. It first preserves the concepts, relationships, and constraints; then it maps them to a scene whose mechanism still behaves the same way. The final explanation includes a concise factual check so an entertaining expression cannot silently reverse the source.

## What it is for

Use it when a reader says a formula, protocol, paper, mechanism, or operating procedure is too abstract and asks for an analogy, a story, or a plain-language explanation. Natural-language requests are enough; this release does not promise the legacy `/conversion` shortcut.

The core skill is portable Agent Skills Markdown. Optional local helpers require Bun and are useful for repeatable structure checks and PDF evaluation.

## Expression styles

Anime remains the default. A user can request one of the following alternatives without changing the factual workflow.

| Style id | Chinese request | Best for | Boundary |
|---|---|---|---|
| `anime` | 二次元 / 轻度 / 中二 | General concepts and vivid scenes | Existing light, standard, and heavy intensity levels remain anime-only. |
| `detective` | 侦探推理 / 破案式 | Evidence, causes, hypotheses, probability updates | Do not invent guilt, motives, or evidence that is absent from the source. |
| `war-room` | 项目战情室 / 指挥室 | Coordination, protocols, workflows, changing relationships | Roles and alerts must represent real constraints, not replace them. |
| `nature-documentary` | 自然纪录片 / 观察镜头 | Time-space change, observation, and system dynamics | Keep causal rules explicit; atmosphere cannot become a substitute for explanation. |

All styles obey the same rule: when a scene cannot preserve the mechanism, lower the style intensity or use a neutral explanation instead of forcing a metaphor.

## How the skill works

1. **Understand** — Restate the source and make assumptions visible.
2. **Extract facts** — List concepts, relationships, and constraints without adding or dropping any.
3. **Map mechanisms** — Give each key concept one story element and explain why the actions are isomorphic.
4. **Express** — Write one short, readable body in the selected style. The default body is at most 800 Chinese characters.
5. **Check** — Run the lay-reader gate, then add a 1–3 sentence factual verification in a non-story voice.

The analysis and mapping table stay folded in `<details>` so the reader sees one explanation first.

## Academic-PDF navigation

For a readable research PDF, the skill does not try to paraphrase every page. It identifies the paper's central contribution from the title, abstract, method, and conclusion; records a temporary fact ledger with page anchors; and explains that contribution by default.

If the PDF contains several unrelated contributions, state the selected focus before writing. If the host cannot read the file reliably, ask for an abstract or selected pages instead of inventing missing facts. A large paper is therefore a navigation task, not an automatic refusal.

## Install

Install the repository as a skill directory named `conversion-skill` so the directory and the YAML `name` match:

```powershell
git clone https://github.com/songhangze985-eng/conversion-skill.git
Copy-Item -Recurse conversion-skill "$env:USERPROFILE\\.codex\\skills\\conversion-skill"
```

For another Agent Skills host, copy the repository root into that host's skills directory with the same `conversion-skill` folder name. The important requirements are a visible `SKILL.md` and matching folder/metadata names.

## Optional local tools

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

## Local paper evaluation policy

For an acceptance run, export the skill to a temporary copy that excludes `.git`. Read source PDFs in place, keep extracted text, rendered pages, fact ledgers, conversion drafts, and grade cards only in that temporary directory, then remove it after reporting the verdict. Do not add PDFs, answers, screenshots, or paper-specific facts to this repository.

The score is four dimensions, two points each:

| Dimension | Full-score requirement |
|---|---|
| 能懂 | An outsider can restate the mechanism in one plain sentence. |
| 保真 | The factual check and story preserve the source mechanism and constraints. |
| 同构 | Every ledger fact has an explicit, non-colliding mapping. |
| 表达不挡懂 | The chosen expression is memorable without adding jargon or unsupported drama. |

Only an 8/8 result, complete fact coverage, a passing structural check, and a clean temporary-workspace check count as acceptance. Preparation, rendering, and structural validation are timed separately from model prose generation.

## Repository layout

```text
conversion-skill/
├── SKILL.md                    # Triggering and five-step workflow
├── references/                 # Mapping, gate, paper navigation, and styles
├── assets/templates/           # Folded-analysis output shells
├── scripts/                    # Optional Bun/TypeScript local helpers
└── evals/                      # Generic rubric and trigger examples only
```

The repository deliberately contains no research-paper fixture, generated paper explanation, or scoring report.

## FAQ

**Does a special style change the facts?**
No. Style only changes how the mechanism is staged. Facts, constraints, and the verification paragraph remain source-grounded.

**What if anime is not appropriate?**
Request `侦探推理`、`项目战情室`、`自然纪录片`, or ask for a neutral explanation. The default never overrides reader preference.

**Why is the paper not explained page by page?**
The skill focuses on the paper's central contribution so a reader can understand and repeat it. It makes the chosen focus explicit and retains page anchors in temporary analysis.

**Does local evaluation upload anything?**
No. The evaluator works from a copy with no `.git` directory and never invokes `git add`, `commit`, `push`, or remote operations.

## License

[MIT](LICENSE)
