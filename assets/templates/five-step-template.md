# 五步骨架

空白骨架由脚本生成，不要在本文件再维护一份手写副本：

```bash
python scripts/generate_template.py -t "<知识点>"
python scripts/generate_template.py -t "<知识点>" --style light --level expand --with-formula
```

交稿排版以 `article-output-template.md` 为准（折叠分析 → 一篇正文 → 知识点校验）。含公式时脚本加「公式含义」占位。操作步骤类用 `--style light`，步骤另列清单。
