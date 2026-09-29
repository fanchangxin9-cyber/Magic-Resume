# 神奇简历 · Magic Resume ✨

> 输入自己的信息，生成一份**有创意、可随时换风格**的 HTML 求职简历。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

一个 **Claude Skill**：把零散的自然语言个人信息，变成一份可以直接打开、可打印成 PDF 的网页版简历。风格不是固定的——**你随时用一句话提示词就能换主题**（换配色、换排版、换创意方向）。

## ✨ 特性

- 🗣️ **自然语言输入**：直接描述你的经历，AI 帮你整理成结构化简历，不用填表。
- 🎨 **创意可定制**：内置多种风格，且可用提示词随时切换（"换深色科技风""改成杂志封面排版"…）。
- 🖼️ **插画背景（可选）**：给简历垫一层背景图层。**自己找一张图就能用 —— 零成本、不联网、不需要任何 Key**；也可以用 AI 按提示词生成（需火山方舟 API Key）。
- 🌐 **输出 HTML**：CSS 全内联、不请求网络资源，任何浏览器离线可用（背景图 / 证件照为同目录本地文件），`Ctrl/Cmd+P` 即可导出 PDF。
- 📦 **跨工具通用**：适用于 TRAE、Claude Code、Cursor 等支持 Claude Skill 的助手。

## 🖼️ 效果示例

### 六套内置模板

![六套模板总览](docs/templates.png)

| 模板 | 风格 | 适合岗位 |
| --- | --- | --- |
| `serif` | 极简衬线 | 技术 / 工程 |
| `banner` | 商务横向分区 | 通用 / 商务 |
| `editorial` | 杂志编辑风 | 媒体 / 文案 / 品牌 |
| `sidebar` | 左侧深色侧栏 | 经历多 / 外企 / 转行 |
| `nouveau` | 新艺术 · 穆夏风 | 艺术 / 策展 / 文化创意 |
| `mecha` | 机甲 · EVA 风 | 游戏 / 二次元 / 潮玩 / 电竞 |

### 插画模式（可选背景图层）

在任意模板上垫一层背景图 —— **自己找一张图就能用，零成本、不联网、不需要任何 Key**；也可以让 AI 按提示词生成。卡片会自动变成半透明，让画面透出来而正文仍然清晰；**打印时背景默认不输出**，投递用的 PDF 依旧是干净白底。

![插画模式示例](docs/illustrated-example.png)

## 📦 安装

将本仓库的 `神奇简历` 目录放入你的 Skills 目录：

- **Claude Code**：`~/.claude/skills/`（或项目内 `.claude/skills/`）
- **TRAE**：项目内 `.trae/skills/` 或全局 Skills 目录
- **Cursor**：项目内 `.cursor/skills/`

确保目录内包含 `SKILL.md` 即可被识别。

## 🚀 使用

1. 触发方式：直接说 *"帮我生成一份简历"* 或 *"用神奇简历生成"*。
2. 用几句话描述你的信息（姓名、经历、技能、求职方向…）。
3. 指定风格，或让 AI 按求职岗位自动推荐。
4. 生成 `<姓名>-resume.html`，浏览器打开 → 打印 → 存为 PDF（默认干净白底、不带插画底，适合投递）。

### 风格提示词示例

| 你想达到的效果 | 提示词 |
| --- | --- |
| 科技感 | "换成蓝紫渐变 + 深色科技风" |
| 活泼亮眼 | "用大胆的马卡龙撞色，卡片式布局" |
| 极简高级 | "黑白极简，大留白，无衬线字体" |
| 杂志感 | "做成杂志封面式，左边大标题竖排" |

详细方法论见 [`references/style-guide.md`](references/style-guide.md)。

## 📁 目录结构

```
神奇简历/
├── SKILL.md                      # 主指令（入口）：两种模式 + 六步工作流
├── LICENSE                       # MIT 开源许可
├── README.md
├── assets/
│   └── templates/                # 3 套风格模板（内含 @resume-meta 元信息）
│       ├── serif.html            # 极简衬线（技术 / 工程岗）
│       ├── banner.html           # 商务横向分区（通用 / 商务岗）
│       ├── editorial.html        # 杂志编辑风（媒体 / 文案 / 品牌）
│       ├── sidebar.html          # 左侧深色侧栏（经历多 / 外企 / 转行）
│       ├── nouveau.html          # 新艺术 · 穆夏风（艺术 / 策展 / 文化创意）
│       └── mecha.html            # 机甲 · EVA 风（游戏 / 二次元 / 潮玩 / 电竞）
├── references/
│   ├── style-guide.md            # 风格定制方法论（两种模式通用）
│   └── background-layer.md       # 插画模式手册（提示词 / 安全区 / 踩坑 / 打印）
└── scripts/                      # 背景图层工具：AI 生成 + 自检 + 注入 HTML
    ├── gen-background.js
    ├── README.md                 # CLI 用法（密钥 / 参数 / 尺寸 / 错误）
    ├── prompt-spec.example.json
    └── test-check.js             # 自检阈值的校准用例
```

## 🔧 自定义 / 进阶

- **改风格**：对任何已生成的简历，直接给一条提示词即可。
- **做成长久模板**：把你的定制产出回填到 `assets/templates/`，成为可选风格。
- **开放给开发者**：若想演进为独立程序，可将提示词与模板固化为脚手架脚本。欢迎 Fork & PR。

## 📄 License

[MIT](LICENSE) © 2026 神奇简历 contributors