# 五步骨架

空白骨架由 Bun 脚本生成，不要在本文件维护第二份手写副本：

```bash
bun run generate-template -- -t "<知识点>" -s anime -l default
bun run generate-template -- -t "<知识点>" -s nature-documentary -l expand --with-formula --with-comprehension
```

`-s` 只能是 `anime`、`detective`、`war-room`、`nature-documentary` 或 `neutral`；未指定表达方式时使用 `anime`。`-l` 为 `default`、`expand` 或 `long`。

交稿排版以 `article-output-template.md` 为准：折叠分析 → 一篇正文 → 知识点校验 → 可选理解检验。生成的骨架应包含 `> 表达风格：` 和 `> 篇幅：` 两行元信息。`--with-comprehension` 才会追加理解检验占位。操作步骤类选 `neutral` 或轻度 `anime`，并把步骤另列成清单。
