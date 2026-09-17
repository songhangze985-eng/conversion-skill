# Changelog

## 2.1.1 — 2026-09-17

补全 v2.1 合并后仍挂着的公开信息与验收说明，不改核心工作流。

- GitHub Description / Homepage / Topics 已按 2.1 定位改好。
- Issue #1 已回复并保持打开。
- 合并后再验证 `npx skills add`，安装到的版本是 2.1.0。
- 增加 `evals/STATUS.md` 和最小 `bun test` 工作流。A/B/C 模型对照仍未执行。

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
