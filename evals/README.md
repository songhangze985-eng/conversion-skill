# 评测入口

本目录把**结构检查**和**语义质量**分开。脚本只能证明材料齐不齐；解释对不对、读者懂不懂，必须按量表人工或独立模型复核。

不要把私人论文、版权受限全文、凭据或某次模型的未复核输出提交进仓库。

## 先跑本地机械检查

在仓库根目录：

```bash
bun install --frozen-lockfile
bun test scripts
bun run validate-input -- "贝叶斯定理 P(A|B)=P(B|A)P(A)/P(B)"
bun run generate-template -- -t "快速排序" -s detective
bun run check-output -- evals/fixtures/ok-three-col.md --style anime
```

`check-output` 的 PASS 只表示机械门禁。文本输出会单独列出：

- 结构检查
- 事实术语及 ID 覆盖
- 语义质量评估（需要人工或模型复核）
- 用户理解验证（未请求，或仅确认题目结构存在）

## 再跑 A/B/C 对照

完整规则见 `protocol.md`。题目见 `cases.md`，输入见 `inputs/`，记录格式见 `record-template.md`。

三组使用同一模型、同一输入、同一评分标准：

- A：不安装本 Skill，直接问模型
- B：不安装本 Skill，但使用 `prompts/group-b.md`
- C：安装并触发 conversion-skill

本仓库当前**没有**填入 A/B/C 的模型原始输出。没有跑通的实验，不得在 README 或 Issue 里写成已经赢过基座模型。
