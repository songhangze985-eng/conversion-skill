# 参与 conversion-skill

先把知识讲对，再把表达写顺。改文档和改脚本都可以，但不要为了看起来更完整而加入用不到的框架、网站或依赖。

## 改之前先看什么

- 产品定位和触发条件在 `SKILL.md`。
- 人怎么安装、怎么判断值不值得用，在 `README.md`。
- 映射和门禁细则在 `references/`，不要把整份原则抄回 `SKILL.md`。
- 脚本接口一旦写进 README 或评测命令，就按向后兼容改。

YAML `name` 必须保持 `conversion-skill`，安装目录也必须是这个名字。不要为了好记改回 `conversion`。

## 两类贡献

**Markdown Skill。** 普通解释路径不能变成「必须安装 Bun」。新增规则优先放进独立的 `references/` 文件，由 `SKILL.md` 按需加载。

**可选脚本。** TypeScript 只放在 `scripts/`。不要引入新的运行时。改 `check-output` 时，现有 CLI 参数和 JSON 字段必须留下；新结论只能新增字段。`verdict` 仍然只表示机械门禁。

## 本地检查

```bash
bun install --frozen-lockfile
bun test scripts
bun run validate-input -- "你好啊"
bun run check-output -- evals/fixtures/ok-three-col.md --style anime
```

没有 Bun 时，至少用预览确认 `SKILL.md` 的 YAML 仍能被解析，且 `name` 未改。推到 GitHub 后，`.github/workflows/check.yml` 会再跑一遍脚本检查。

## 不要提交

- 私人论文、版权受限全文、抽取文本、页图
- 凭据、`.env`、未脱敏的本地路径里的真实用户材料
- 编造的模型输出、安装次数、GitHub star 或「理解提升」数字
- 把某次评测的原始长文直接塞进仓库；记录模板在 `evals/record-template.md`，填好的运行结果放仓库外

## 提交说明

用一两句话写清为什么要改，而不是只列文件名。用户可见的行为变化，应同时改 README 或 `CHANGELOG.md`。打开 PR 前看 `.github/PULL_REQUEST_TEMPLATE.md`。
