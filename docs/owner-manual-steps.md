# 需要仓库所有者手动完成的事项

当前环境没有 GitHub 写入权限（`gh auth status` 显示未登录），因此下面这些不能在本机替你改掉。也不要让代理直接 push、发 Release 或改仓库名。

## GitHub 仓库设置

建议把公开元信息改成和 v2.1 一致，不要再写「四步流程 + 二次元故事风格」。

- **Description：** `Mechanism Explainer — 可验证的复杂知识解释 Skill`
- **Homepage：** `https://github.com/songhangze985-eng/conversion-skill` 或 `https://agentskills.io`
- **Topics：** `agent-skills`、`eli5`、`explainer`、`plain-language`、`education`、`knowledge-explanation`、`analogies`

这些词都对应仓库真实功能，不要再堆 `ai`、`llm`、`chatgpt` 这类空标签。

## 发布与回复

- 审核后提交 `v2.1.0` 的 git commit；需要推送时再由所有者执行。
- 审核 [`docs/issue-1-reply-draft.md`](issue-1-reply-draft.md) 再回复 Issue #1。不要由代理直接评论或关单。
- [skills.sh 上的 conversion-skill 页](https://www.skills.sh/songhangze985-eng/conversion-skill/conversion-skill) 在 2026-09-17 仍 404。仓库侧 YAML 已是 `conversion-skill`。若页面不恢复，只能向 skills.sh / vercel-labs/skills 反馈，或等爬虫刷新。

## 尚未执行、不要对外宣称完成的事

- A/B/C 三组模型对照还没有原始输出。
- 宿主里「下一句对话自动触发 Skill」未在真实 Cursor / Claude 会话中复核。
- GitHub Insights、安装次数、star 变化一律未知。
