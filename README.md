# conversion-skill

**可验证的复杂知识解释 Skill。** 让复杂知识变得易懂，同时让每个比喻都有据可查。

English: Mechanism Explainer — explain complex knowledge with traceable analogies and factual verification. It is an [Agent Skill](https://agentskills.io) for Claude Code, Cursor, Codex, Copilot, Gemini CLI, and other hosts that read `SKILL.md`.

读了好几遍还不懂的公式、协议、论文或系统机制，可以变成普通人听完能复述的短解释。解释必须留下概念映射和知识点校验；比喻只能帮助理解，不能偷偷改掉机制。二次元、侦探推理、项目战情室和自然纪录片都还在，但它们是可选表达，不是这个项目要推销的身份。

核心能力只靠一份 Markdown Skill。普通使用不需要 Bun、TypeScript 或 Python。

```bash
npx skills add songhangze985-eng/conversion-skill
```

装好后直接说「帮我理解快速排序的运行原理」即可。目录名和 YAML `name` 都是 `conversion-skill`，不要改成 `conversion`。

## 它实际长什么样

下面这一组材料可以在仓库里核对。Skill 回答来自 [`references/domain-examples.md`](references/domain-examples.md) 的达标样例，不是某次线上模型的原始日志。普通模型对照尚未执行，因此这里不伪造「无 Skill」回答，也不宣称理解能力提高了多少。

**输入**

选一个 pivot，小的放左、大的放右，递归处理两边。

**Skill 样例（已核对）**

运动会预选。皮沃特老师随手点一个人当达标线。「达标左边，没达标右边。定线的人这轮不比了，名次卡在两拨中间。」小快问：「一直分？」老师：「一组只剩一个人就不比。选哪条线都行，选偏了只是慢，名次仍对。」

外行应能复述：先定一条线把人分成两拨，定线的人位置先钉死，两拨再各自重复，直到没法再分。

**概念映射**

| 知识概念 | 类比元素 | 对应机制 | 适用边界 |
|---|---|---|---|
| pivot | 本轮达标线 | 用来分组的基准 | 选哪条线只影响快慢，不决定名次对错 |
| 分区 | 达标站左、不达标站右 | 按与基准的比较结果分组 | 不是按身高、学号或其他无关属性排队 |
| 递归 | 两组再各自选新达标线 | 对子组重复同一规则 | 不是两组之间再比一次总分 |
| 终止 | 一组只剩一人就不比 | 规模 ≤1 时停止 | 不是永远分下去 |
| pivot 不再比 | 定线的人本轮名次锁定 | 分区后位置已定 | 定线的人不是本轮冠军 |

**知识点校验**

快排每轮选 pivot 分区，pivot 位置确定后不再递归，对左右子组重复，子组规模 ≤1 时停止。pivot 影响效率不影响正确性。

**普通模型对照**

未执行。2026-09-17 的本机环境里没有可用的独立模型 API，因此不能用正在维护本仓库的对话模型冒充 A 组或 C 组。若要补做，使用同一输入、同一模型版本和 [`evals/protocol.md`](evals/protocol.md)，把原始输出写入仓库外的记录。当前执行台账见 [`evals/STATUS.md`](evals/STATUS.md)。

贝叶斯更新的侦探版样例也在 `references/domain-examples.md`，同样带有适用边界：没线索不等于宣告无罪，招供也不等于概率更新。

## 安装

### 已验证的一键安装

在 2026-09-17 的 Windows + Cursor CLI 环境中，[skills CLI](https://github.com/vercel-labs/skills) 能够识别本仓库、发现根目录 `SKILL.md`，并完成安装。下面这行就是实际跑通的命令：

```bash
npx skills add songhangze985-eng/conversion-skill
```

合并 v2.1.0 之后又跑过一次：CLI 检测到 Cursor，走了非交互安装，技能落到 `.agents/skills/conversion-skill/`。YAML `name` 与文件夹名都是 `conversion-skill`，`metadata.version` 是 `2.1.0`。

在普通交互终端里，同一行可能会先让你选宿主。若只想先确认仓库里有没有这个技能，可以运行：

```bash
npx skills add songhangze985-eng/conversion-skill -l
```

它应当列出 `conversion-skill`。

[skills.sh](https://www.skills.sh/songhangze985-eng/conversion-skill/conversion-skill) 在 2026-09-17 仍返回「isn't available in this repository」。这是目录站点的外部状态，不是本仓库缺少 `SKILL.md`。在该页恢复之前，不要把 skills.sh 写成已经可装。

安装成功只证明文件就位。宿主会不会在下一句对话里自动触发 Skill，取决于具体产品，当前标记为未验证。

### Windows

PowerShell：

```powershell
npx skills add songhangze985-eng/conversion-skill
```

若只能手动拷贝：

```powershell
git clone https://github.com/songhangze985-eng/conversion-skill.git
Copy-Item -Recurse conversion-skill "$env:USERPROFILE\.agents\skills\conversion-skill"
```

Cursor 用户也可以拷到 `"$env:USERPROFILE\.cursor\skills\conversion-skill"`，Codex 则是 `"$env:USERPROFILE\.codex\skills\conversion-skill"`。文件夹名必须是 `conversion-skill`。

### macOS / Linux

```bash
npx skills add songhangze985-eng/conversion-skill
```

手动安装：

```bash
git clone https://github.com/songhangze985-eng/conversion-skill.git
mkdir -p ~/.agents/skills
cp -R conversion-skill ~/.agents/skills/conversion-skill
```

其他宿主把同一目录放到各自的 skills 根目录即可，例如 `~/.claude/skills/conversion-skill` 或 `~/.cursor/skills/conversion-skill`。

### 无终端时

下载 [SKILL.md](https://raw.githubusercontent.com/songhangze985-eng/conversion-skill/main/SKILL.md)，在支持上传 Skill 的产品设置里导入。可选脚本不会一起生效，但不影响普通解释。

### 安装验收

1. 目标目录存在 `SKILL.md`。
2. 该文件的 YAML `name` 是 `conversion-skill`。
3. 文件夹名也是 `conversion-skill`，不要改成 `conversion`。
4. 对宿主说：「帮我理解快速排序的运行原理。」若技能被触发，输出应有映射和知识点校验；若没有触发，先检查目录名，再显式提到 conversion-skill。自动触发本身需要在你的宿主里复核。

### 可选工具依赖

日常使用只需要宿主能读 `SKILL.md`。`scripts/` 里的 Bun/TypeScript 工具用来做输入分流、骨架生成、结构检查和本地 PDF 评测，**不是**普通解释的前提。要用这些工具时再安装 [Bun](https://bun.sh/) 1.1 或更高版本，并在仓库根目录运行 `bun install`。没有 Bun 也能把知识讲懂。

## 怎么用

技能靠 `SKILL.md` 的 description 匹配自然语言。用户不必先打技能名。下面三句都应该走进同一套工作流：理解、提炼事实、做可对照的类比、写出短解释、再用非故事腔校验。

「帮我理解快速排序的运行原理。」

「用通俗的语言解释这篇论文的核心贡献，保留重要限制。」

「用侦探推理的方式讲解贝叶斯定理，并指出比喻在哪些地方不成立。」

用户说看不懂、太抽象、讲人话、用比喻讲清楚、老妪能解，或要一篇论文的核心贡献时，也应触发。只要一句话、不要映射，或者是在写小说、翻译、会议纪要、代码审查、导出 PDF 原文，则不应触发。

默认正文不超过 800 字，默认表达仍是二次元。可以说「用轻度」「用项目战情室」「用自然纪录片」或「不要故事，直接讲」。当比喻保不住机制时，技能应改口中性说明。若还想检查自己有没有懂，可以要求一道复述题和一道迁移题；普通使用默认不出题。

## 它保证什么，不保证什么

它保证解释可以核对：事实清单、映射、适用边界和知识点校验是给读者和评测者看的，不是装饰。论文输入会先建带页码锚点的临时事实清单；读不清就停，不编来源。

它不保证「理解能力提升百分之多少」，也不保证每次都比未安装的模型更好。那些结论只能来自 [`evals/`](evals/) 里的对照实验。现有 `check-output` 通过，只说明结构或术语覆盖齐了，不能说明知识正确，更不能说明用户已经掌握。

## 可选本地命令

```bash
bun install
bun test scripts
bun run validate-input -- "贝叶斯定理 P(A|B)=P(B|A)P(A)/P(B)"
bun run generate-template -- -t "快速排序" -s detective --with-comprehension
bun run check-output -- evals/fixtures/ok-four-col.md --style detective
```

`evaluate-pdf` 只在仓库外的空临时目录工作，不调用 Git，也不生成故事正文。评测怎么跑，见 [`evals/README.md`](evals/README.md)。

## 许可

[MIT](LICENSE)
