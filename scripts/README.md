# scripts/ · 背景图层生成

> 属于**插画模式（illustrated）**。基础模式（basic）不用这个目录，也不用配 Key。
> 本文件只讲**怎么用这个脚本**：密钥 / 参数 / 尺寸 / 错误。
> 四栏怎么拆、提示词怎么写、安全区怎么算、踩过哪些坑、自检的能力边界、背景怎么接进 HTML —— 全部见 `../references/background-layer.md`。

用**火山方舟 Ark / Doubao Seedream 5.0** 生成简历用的「背景 + 装饰」图层：A4 竖版、画面内**不得出现任何文字/水印**，中央与证件照位保持干净。

- 入口：`gen-background.js`（Node ≥ 18，零依赖，用内置 `fetch` / `zlib`）
- 模型：`doubao-seedream-5-0-260128`
- 接口：`POST https://ark.cn-beijing.volces.com/api/v3/images/generations`

## 1. API Key（只有 AI 生成那条路需要）

> 走 `--image` 自带背景图的，**不需要 Key，本节可跳过**（见 §2 ③）。

三选一，优先级从高到低：

```bash
# a) 环境变量（推荐）
export ARK_API_KEY=ark-xxxxxxxx

# b) 密钥文件（已加入 .gitignore，不会进版本库）
echo "ark-xxxxxxxx" > scripts/.ark_key

# c) 单次传入
node scripts/gen-background.js --api-key ark-xxxx --prompt "..."
```

## 2. 快速开始

```bash
# ① 先看提示词，不花钱、不调用 —— 用来给用户确认
node scripts/gen-background.js --template banner --spec my-spec.json --dry-run

# ② 生成 → 自检 → 注入简历（一条命令跑完）
node scripts/gen-background.js --template banner --spec my-spec.json --check --apply 张三-resume.html

# ③ 只为已有图片做自检 / 注入（不重新生成）
#    自带背景图走这条 —— 不需要 API Key、不花钱
node scripts/gen-background.js --image 我的图.png --template banner --check --apply 张三-resume.html

# ④ 校准自检阈值（可选）
node scripts/test-check.js     # 纯渐变区 0.00 / 含文字区 13.47
```

产物落在 `output/`：`<name>.png` + 同名的 `<name>.prompt.txt`（记录实际使用的完整 prompt，便于复现与微调）。

自检只支持 PNG。**`--check` 是启发式提示、不是验收** —— 它抓得到什么、抓不到什么，见 `../references/background-layer.md` 第 6 节。

## 3. 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--template <名字\|路径>` | — | `serif` / `banner` / `editorial` / `sidebar` / `nouveau` / `mecha`，或任意带 `@resume-meta` 的 HTML。读它推导安全区、配色、A4 尺寸 |
| `--prompt <text>` | — | 整段 prompt |
| `--spec <file\|->` | — | 四栏 JSON；`-` 表示从 stdin 读 |
| `--background/--decoration/--style/--global` | — | 逐栏传入 |
| `--apply <简历.html>` | — | 生成后把 PNG 拷到简历同目录，并注入 `--bg-image` + `.mode-illustrated` |
| `--check` | — | 生成后跑自检（也可配合 `--image` 单独用） |
| `--image <png>` | — | 跳过生成，直接处理已有图片。**这条路不需要 API Key** —— 自带背景图走它，会顺带报出图片尺寸与 A4 比例偏差 |
| `--model` | `doubao-seedream-5-0-260128` | 模型 ID |
| `--size` | 模板的 A4 尺寸 / `2304x3072` | 显式宽高，或档位 `2K` |
| `--name` | `resume-bg` | 输出文件名（不含扩展名），重名自动加 `-2` |
| `--out` / `--outdir` | — / `<项目>/output` | 输出路径 / 目录 |
| `--api-key` | — | 覆盖环境变量与密钥文件 |
| `--dry-run` | — | 只打印请求体（含模板推导出的两栏），不调用 |
| `--help` | — | 用法说明 |

`watermark` 固定为 `false`，`output_format` 固定为 `png`（不指定的话接口默认回 JPEG，会存出一个名不副实的 `.png`），均不开放参数。脚本仍会按文件头复核真实格式，是 JPEG 就老实存成 `.jpg`。

## 4. size 的取值范围

不传 `--size` 时，给了 `--template` 就用模板里的 A4 尺寸（`2304x3264`），否则兜底 `2304x3072`（3:4）。换尺寸注意像素总量限制：

| 模型 | 像素总量范围 | 宽高约束 |
| --- | --- | --- |
| Seedream 5.0 lite（当前） | ≥ 2560×1440，≤ 4096×4096 | 宽、高均为 16 的倍数，长宽比在 [1/16, 16] |
| Seedream 5.0 pro | ≥ 1280×720，≤ 2048×2048×1.1025 | 同上 |

也可以直接给档位：`--size 2K`（lite 支持 `2K`/`3K`/`4K`），此时由模型按 prompt 里的画幅描述自行决定比例。

> 为什么默认按 A4 而不是 3:4 —— 见 `../references/background-layer.md` 第 4.2 节。

## 5. 常见错误

| 现象 | 原因 / 处理 |
| --- | --- |
| `401` / `AuthenticationError` | Key 错误或已失效 |
| `ModelNotOpen` / `InvalidParameter` | 模型未在方舟控制台开通，或 `--size` 超出范围 |
| `429` / `QuotaExceeded` | 限流或余额不足 |
| `模板里没有 @resume-meta 元信息块` | 用的不是本项目的模板；`--template` 传了别的 HTML |
| `没有 --bg-image 变量` | 简历骨架不是 `assets/templates/` 里的模板，插画模式需要它自带的背景图层支持 |
| 图片右上角多了个框 / 中央被图案侵占 | 提示词写法问题 → 见 `../references/background-layer.md` 第 4 节 |

单张 A4 图耗时约 60s。
