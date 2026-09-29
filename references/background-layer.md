# 插画模式 · 背景图层手册

> 只在**插画简历（illustrated）**模式下读这份。基础模式（basic）用不到脚本，也不用读。
>
> 背景图层 = 一张 A4 竖版的「背景 + 装饰」PNG，垫在简历下面。它本身**不含任何文字**，所有内容仍由 HTML 渲染 —— 这样文字可选中、可搜索、可换行，也不会因为重新生图而丢失。
>
> 命令行怎么跑（密钥 / 参数 / 错误码 / 尺寸档位）见 `scripts/README.md`；**本手册只讲怎么想**：提示词怎么写、安全区怎么算、踩过哪些坑、自检能信到什么程度、背景怎么接进 HTML。

## 先决定：背景图从哪来（两条路）

|  | **用户自备图** | **AI 生成** |
| --- | --- | --- |
| 花钱 | 0 | 按次计费，约 60s/张 |
| 需要 Key | **不需要** | 需要 |
| 可控性 | 素材说了算，想要什么有什么 | 靠提示词，有随机性 |
| 怎么跑 | `--image 图.png --apply 简历.html` | 见本手册 §1–§4 + `scripts/README.md` |

**自备图必须满足这几条**，否则铺上去会毁掉可读性（脚本会自动报尺寸和比例偏差）：

- **A4 竖版**，比例 ≈ `0.706`。差太多时 `cover` 铺满必然裁掉一条边。
- **整张无文字**，**中央保持低对比、干净** —— 它是垫在正文底下的，中间一花字就看不清。
- **分辨率够**：高度 ≥ 1600px，否则铺满 A4 会发虚。
- 重要元素别贴边，尤其是**右侧**（证件照位在右上，卡片正文在中间）。

拿到图之后一条命令搞定，**全程不碰 API**：

```bash
node scripts/gen-background.js --image 我的图.png --check --apply 张三-resume.html
```

是 JPEG 就去掉 `--check`（自检只支持 PNG），注入不受影响：

```bash
node scripts/gen-background.js --image 我的图.jpg --apply 张三-resume.html
```

图比较花、正文读不清时，把简历 `:root` 里的 `--scrim` 调高一点压住背景即可。不满意就换张图或走下面的 AI 生成。

## 1. 模板元信息：几何与配色的单一事实来源

每套模板的开头都有一段机器可读的 `@resume-meta`，脚本读它来推导提示词 —— 所以安全区和配色**不用手写、也不会漂移**：

```html
<!-- @resume-meta
{
  "template": "banner",
  "label": "商务横向分区",
  "colorMode": "light",
  "styleHint": "understated corporate illustration, clean neutral ground, one calm horizontal band near the top, hairlines only, no glow, very low contrast",
  "palette": { "primary": "#1e3a5f", "accent": "#b08d57", "bg": "#ffffff", "card": "#eef1f5", "ink": "#1c1c1c" },
  "zones": {
    "content":   [0.04, 0.02, 0.92, 0.96],
    "photo":     [0.79, 0.035, 0.17, 0.14],
    "decorBand": 0.04
  },
  "size": "2304x3264"
}
-->
```

坐标一律是 **A4 版面上的归一化值** `[x, y, 宽, 高]`（0~1，左上角为原点）：

| 字段 | 含义 |
| --- | --- |
| `content` | 简历正文区。背景在这里必须是平坦低对比的 |
| `photo` | 一寸证件照位。**各模板位置差很多**：`serif`/`banner`/`mecha`/`editorial` 在页眉右侧，`nouveau` 在页眉右下（拱形框），`sidebar` 在左栏顶部 |
| `decorBand` | 允许出现装饰的最外缘宽度 |
| `size` | 该模板对应的 A4 出图尺寸 |
| `colorMode` | `light` / `dark`，决定配"柔和高雅"还是"发光的亮色点缀" |

改模板配色时顺手更新 `palette`，背景生成会自动跟着走。换了新模板就照抄一份元信息块。

## 2. 四栏拆解：只写两栏，其余交给模板

脚本会按 `background → decoration → style → global` 拼成整段 prompt，并自动补 `Vertical 3:4, high resolution, no text, no watermark`。

**你通常只需要写前两栏**，`style` / `global` 由模板推导（写了就以你的为准）：

| 栏位 | 谁写 | 要点 |
| --- | --- | --- |
| `background` | **你写** | 底色、渐变方向、光线质感。用具体色值（`#eef0ff`）比形容词可靠 |
| `decoration` | **你写** | 装饰元素 + **分布范围**（只在外缘）。写宽了中央就脏 |
| `style` | 模板推导 | 画风 + 简历配色（自动注入 `palette` 的色值）+ 深浅调性 |
| `global` | 模板推导 | 正面描述整幅构成（见下节，写法有讲究） |

范本：`scripts/prompt-spec.example.json`。

## 3. 配色跟简历走

由 `colorMode` 自动分流，对应两条老规矩：

- `light` → 柔和高雅配色（浅色系简历）
- `dark` → 深色底 + 发光的亮色点缀（内置模板里只有 **`mecha`** 是 `dark`，其余五套为 `light`）

`style` 栏会把 `palette` 里的 `primary / accent / bg` 原样写进提示词，所以"背景与简历主色系一致"是**自动达成**的，不靠模型自觉。

## 4. 踩坑记录（这一节最值钱）

### 4.1 千万别提"证件照位"，也别写"不要画框"

这是同一个坑的两个面，两次实测都翻车：

| 提示词写法 | 实际出图 |
| --- | --- |
| `the ID-photo island ... must be free of any pattern` | 右上角画了个证件照占位框 |
| `do not draw any frame, box, rectangle, card, sticker, border or placeholder shape` | 画了个**更大更明显**的矩形面板 |
| 只做正面描述：`one single continuous soft gradient...` | ✅ 干净，什么都没有 |

生图模型会**照着名词作画**：你提"照片位"它就画框，你列"不要画矩形"它满脑子都是矩形。所以 `global` 栏只用正面陈述：

> Fill the whole canvas with one single continuous soft gradient, unbroken and uniform across the middle...; confine every sparkle, bubble and ornament to the outermost N% margin band so nothing drifts inward; the central area stays smooth and undisturbed.

证件照位和文字区的干净，靠的是**结构性达成**（中间本来就什么都没画），而不是点名禁止。

### 4.2 比例对齐 A4，别用 3:4

A4 是 0.707，3:4 是 0.75。用 3:4 出图再 `cover` 铺到 A4 上会横向裁掉约 5.7%，画面会被切掉一截。模板里的 `size` 已按 A4 算好（`2304x3264`，宽高都是 16 的倍数，落在 Seedream 的像素范围内）。

## 5. HTML 侧：可读性与打印

背景是氛围，不能抢文字的戏。模板已经内建好，改模板时别把它改坏：

- `.bg-layer` 固定铺满视口，`z-index:-1`，只在 `.mode-illustrated` 下显示；
- 内容容器用 `--scrim` 半透明遮罩压住背景，保住正文可读性。各模板取值不同：`mecha` `.86`（深色），`serif`/`sidebar` `.88`，`banner` `.89`，`nouveau` `.90`，`editorial` `.92`（纸感越强越接近实心，且**不加毛玻璃**）；
- `@media print` 默认把底图关掉（`.bg-layer{display:none}`）且卡片恢复实心 —— **投递用的 PDF 不带插画底**。想要带底图打印，给 `<body>` 加 `class="print-with-bg"`：底图改铺在页面画布上（`body` 背景，不用 `position:fixed` —— 打印时 fixed 定位只作用于首页），卡片保持 `--scrim` 半透明。**必须在打印对话框勾上「背景图形」，否则会打出一张白纸。**

宽屏下简历卡片只占中间约 62% 宽，两侧留白正好露出背景的装饰与光晕；窄屏或打印时背景整层隐藏，属预期行为。

## 6. 自检能做什么、不能做什么

`--check` 是**启发式提示，不是验收**。它的实测能力边界：

| 检查项 | 能不能信 |
| --- | --- |
| 正文区/证件照位的边缘能量（抓文字、花纹侵入） | **可信**。实测：纯渐变 0.0、稀疏细文字 13.5、干净生成图 0.7~1.6，阈值取 4 分离得很开 |
| 网格扫描抓"占位框" | **只抓得到明显的**。明显的矩形 ΔRGB 27.8 能抓到；但角落的大星星/气泡也能顶到 10~14，和轻微色块（7.9）分不开 —— 所以阈值定在 20，并且只当提示 |

**结论：出图之后必须人眼看一遍。** 自检只是帮你少看几眼。

## 7. 尺寸与成本

单张约 60s，默认 `2304x3264`（A4）。像素总量限制、`2K/3K/4K` 档位、宽高必须是 16 的倍数 —— 见 `scripts/README.md` 第 4 节。
