# conversion

把晦涩、读不懂的专业知识，转成普通人听得懂的短文。默认二次元轻小说皮肤，但先过「老妪能解」：写完能念给外行听，听不懂就改。

灵感是白居易「解则录，不解则易」。二次元是第一套皮肤，不是技能本体。

## 安装

把本目录放到技能根目录，文件夹名用 `conversion`：

```
<skills根目录>/conversion/
├── SKILL.md
├── scripts/
├── references/
├── assets/
└── evals/
```

Grok：拷到 `~/.grok/skills/conversion/`。Claude Code / TRAE：放到对应 skills 目录。

`name` 必须是 `conversion`（kebab-case）。不要用「转换skill」当 YAML 名。

## 什么时候会触发

直接说需求即可：

- 「贝叶斯定理看不懂，用比喻讲讲」
- 「Raft 太抽象，讲成故事」
- 「二次元风格解释这段」
- 「转换一下分布式锁」

不是通用 ELI5，也不是写小说。要有映射表，要能回溯到原定义。

## 默认行为

- 正文 **≤800 字**，能一次念完。
- 皮肤：二次元标准档（一场景、少量对话）。说「轻度 / 重度」可调浓度。
- 分析过程折叠。正文只出现一次。
- 写完过老妪门禁，再附 1–3 句知识点校验。

说「详细一点 / 再展开」→ 800–2500 字。点名一万字或丢来巨大文件，先按番茄作家口吻回一句，再请你缩小范围或接受短稿。

## 番茄作家口吻（对使用者，不进正文）

| 情况 | 回复 |
|------|------|
| 写到一半卡住 | 卡文了，稍等 |
| 交不出稿 | 封禁中 |
| 文件太大 | 没有稿费我可不写 |
| 点名万字 | 这么多！是让我写水文吗 |
| 催更且做不到立刻交 | 水文ing，有事请拨打10086 |

空闲聊不会回「封禁中」。安全拒写不套这个梗。

## 五步

理解 → 提炼 → 意象映射 → 转换 → 老妪能解门禁。前三步可展开核对；映射原则见 `references/mapping-principles.md`。

## 结构

```
conversion/
├── SKILL.md
├── scripts/           validate_input.py / generate_template.py / check_output.py
├── references/        mapping-principles / lao-yu-gate / style-anime / author-voice / domain-examples
├── assets/templates/  输出骨架与角色原型
└── evals/             样例与评分
```

脚本可选。核心是提示词。`check_output.py` 验映射表、校验段、默认篇幅，不拿「酱 / 咖啡馆」当及格线。

```
python scripts/validate_input.py "贝叶斯定理 $P(A|B)=...$"
python scripts/generate_template.py --topic "快速排序" --style standard --level default
python scripts/check_output.py result.md --level default
```

## License

MIT
