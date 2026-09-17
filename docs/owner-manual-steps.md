# 仓库所有者待办

已完成的项不要再做一遍。下面只保留仍需人工处理或仍未验证的内容。

## 已完成（2026-09-17）

- v2.1.0 已合进 `main`：https://github.com/songhangze985-eng/conversion-skill/pull/2
- GitHub Description 已改为 `Mechanism Explainer — 可验证的复杂知识解释 Skill`
- Homepage 已设为 `https://agentskills.io`
- Topics 已设为 `agent-skills`、`eli5`、`explainer`、`plain-language`、`education`、`knowledge-explanation`、`analogies`
- Issue #1 已回复，且保持打开：https://github.com/songhangze985-eng/conversion-skill/issues/1#issuecomment-5709597460
- 合并后重新执行 `npx skills add songhangze985-eng/conversion-skill`，装到的 YAML `version` 是 `2.1.0`

## 仍需人工或外部处理

- [skills.sh 上的 conversion-skill 页](https://www.skills.sh/songhangze985-eng/conversion-skill/conversion-skill) 仍 404。仓库侧 `SKILL.md` 和 YAML `name` 已是 `conversion-skill`。只能等 skills.sh 爬虫刷新，或向 [vercel-labs/skills](https://github.com/vercel-labs/skills) 反馈。
- 不要发 Release，除非你明确要打版本标签。
- 不要改仓库名。

## 仍未验证、不要对外宣称完成

- A/B/C 三组模型对照：本机没有独立模型 API，因此没有原始输出，也没有四维对照分。
- 宿主里「下一句对话自动触发 Skill」：文件已装到 `~/.agents/skills/conversion-skill`，但还没有在新开的真实对话里复核触发。
- GitHub Insights、安装次数、star 变化一律未知。
