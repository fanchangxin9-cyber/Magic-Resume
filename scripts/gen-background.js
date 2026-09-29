#!/usr/bin/env node
/**
 * 神奇简历 · 背景图层生成脚本
 * 模型：doubao-seedream-5-0-260128（火山方舟 Ark / Seedream 5.0）
 *
 * 干什么：按「四栏拆解」生成简历用的背景 + 装饰图层（画面内不含任何文字），
 *         产出 A4 竖版 PNG，并可直接注入 HTML 简历（--apply）。
 * 怎么读：--template 会读模板里的 <!-- @resume-meta --> 元信息块，
 *         据此自动生成 Global / Style 两栏，保证「留白安全区」「配色一致」不是靠自觉。
 *
 * 用法见 scripts/README.md
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const ENDPOINT = process.env.ARK_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const DEFAULT_MODEL = 'doubao-seedream-5-0-260128';
const DEFAULT_SIZE = '2304x3072'; // 3:4 兜底；给了 --template 则用模板里的 A4 尺寸
const DEFAULT_OUTDIR = path.join(ROOT, 'output');
const SPEC_TAIL = 'Vertical 3:4, high resolution, no text, no watermark';
const TEMPLATE_DIR = path.join(ROOT, 'assets', 'templates');

// 四栏拆解 → 完整 prompt 的拼接顺序（与 SKILL 里的输出格式一致）
const FIELDS = ['background', 'decoration', 'style', 'global'];

function fail(msg) {
  console.error('\n✖ ' + msg + '\n');
  process.exit(1);
}
const pct = (v) => Math.round(v * 100);

// ---------------------------------------------------------------- 参数解析

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2), n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) o[k] = true;
    else { o[k] = n; i++; }
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help || opts.h) {
  const head = fs.readFileSync(__filename, 'utf8').split('*/')[0];
  console.log(head.slice(head.indexOf('/**') + 3).replace(/^\s*\* ?/gm, '').trim());
  console.log('\n详细用法见 scripts/README.md');
  process.exit(0);
}

// ---------------------------------------------------------------- 密钥
// 优先级：--api-key > 环境变量 ARK_API_KEY > scripts/.ark_key

function resolveApiKey() {
  if (typeof opts['api-key'] === 'string' && opts['api-key'].trim()) return opts['api-key'].trim();
  if (process.env.ARK_API_KEY && process.env.ARK_API_KEY.trim()) return process.env.ARK_API_KEY.trim();
  const f = path.join(__dirname, '.ark_key');
  if (fs.existsSync(f)) {
    const k = fs.readFileSync(f, 'utf8').trim();
    if (k) return k;
  }
  fail([
    '未找到 API Key。三选一：',
    '  1) 环境变量  ARK_API_KEY=xxx node scripts/gen-background.js',
    '  2) 密钥文件  echo "xxx" > scripts/.ark_key   （已 gitignore）',
    '  3) 命令行    node scripts/gen-background.js --api-key xxx',
  ].join('\n'));
}

// ---------------------------------------------------------------- 模板元信息

function loadTemplateMeta() {
  const t = opts.template;
  if (!t) return null;
  if (t === true) fail('--template 后面要跟模板名或路径，如 --template banner');
  const file = /[\\/]/.test(t) || t.endsWith('.html')
    ? path.resolve(process.cwd(), t)
    : path.join(TEMPLATE_DIR, `${t}.html`);
  if (!fs.existsSync(file)) fail(`找不到模板：${file}`);
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<!--\s*@resume-meta([\s\S]*?)-->/);
  if (!m) fail(`模板里没有 @resume-meta 元信息块，无法推导安全区：${file}`);
  let meta;
  try { meta = JSON.parse(m[1]); } catch (e) { fail(`@resume-meta 不是合法 JSON：${e.message}`); }
  meta.__file = file;
  return meta;
}

function buildGlobalClause(meta) {
  const band = pct(meta.zones.decorBand === undefined ? 0.04 : meta.zones.decorBand);
  // 实测教训（两次）：只要提到"证件照位"或"不要画框/矩形/占位形状"，模型就真的画一个框 ——
  // 第一次提及 photo island 画了个小框，第二次明令禁止 frame/box/rectangle 反而画了个更大的矩形面板。
  // 所以这里只做正面描述：整幅是一个连续的柔和渐变，装饰只贴外缘。
  // 证件照位与文字区不被侵占是「结构性」达成的（中间本来就什么都没有），不靠点名禁止。
  return `Fill the whole canvas with one single continuous soft gradient, unbroken and uniform across the middle, so the surface stays gentle and low-contrast overall; confine every sparkle, bubble and ornament to the outermost ${band}% margin band so nothing drifts inward; the central area stays smooth and undisturbed.`;
}

function buildStyleClause(meta) {
  const p = meta.palette || {};
  const bits = [`primary ${p.primary}`];
  if (p.accent && p.accent !== p.primary) bits.push(`accent ${p.accent}`);
  if (p.bg) bits.push(`page background ${p.bg}`);
  const hint = meta.styleHint || 'soft illustration, gentle and airy';
  return `${hint}, palette locked to the resume colors — ${bits.join(', ')} — subtle enough to sit behind body text without hurting legibility.`;
}

// ---------------------------------------------------------------- prompt 组装

function buildPrompt(meta) {
  let spec = {};
  if (typeof opts.prompt === 'string') {
    spec = { background: opts.prompt }; // 整段直接给，后面不再补模板栏位
    return normalize(opts.prompt);
  }
  if (typeof opts.spec === 'string') {
    const raw = opts.spec === '-'
      ? fs.readFileSync(0, 'utf8')
      : fs.readFileSync(path.resolve(process.cwd(), opts.spec), 'utf8');
    spec = JSON.parse(raw);
  } else {
    for (const f of FIELDS) if (typeof opts[f] === 'string') spec[f] = opts[f];
  }

  // 模板推导只填空缺的栏位：用户显式写了就听用户的
  if (meta) {
    if (!spec.style) spec.style = buildStyleClause(meta);
    if (!spec.global) spec.global = buildGlobalClause(meta);
  }

  const parts = FIELDS.map((f) => (spec[f] || '').trim()).filter(Boolean);
  if (!parts.length) {
    fail('没有可用的 prompt。请用 --prompt "..." 或 --spec spec.json，或用 --background/--decoration/--style/--global 分别传入。');
  }
  return normalize(parts.join(' '));
}

// 压掉多余空白，并保证结尾固定标注只出现一次
function normalize(text) {
  let p = text.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  if (!p.endsWith(SPEC_TAIL)) p += '. ' + SPEC_TAIL;
  return p;
}

// ---------------------------------------------------------------- API

// 按文件头识别真实格式：接口即便指定 png 也可能回 JPEG
function sniff(buf) {
  if (buf.length > 3 && buf.readUInt32BE(0) === 0x89504e47) return { ext: '.png', mime: 'image/png' };
  if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) return { ext: '.jpg', mime: 'image/jpeg' };
  if (buf.length > 11 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: '.webp', mime: 'image/webp' };
  return { ext: '.bin', mime: 'application/octet-stream' };
}

// 读图片像素尺寸：PNG 看 IHDR，JPEG 扫 SOF 标记。自带图（--image）不是本脚本生成的，
// 尺寸和比例没人替你保证 —— 拿它铺 A4 之前先报出来，免得裁掉关键内容。
function imageSize(buf) {
  if (buf.length > 24 && sniff(buf).ext === '.png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (sniff(buf).ext === '.jpg') {
    let p = 2;
    while (p + 9 < buf.length) {
      if (buf[p] !== 0xff) { p++; continue; }
      const m = buf[p + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { w: buf.readUInt16BE(p + 7), h: buf.readUInt16BE(p + 5) };
      }
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd9)) { p += 2; continue; }
      p += 2 + buf.readUInt16BE(p + 2);
    }
  }
  return null;
}

function describeExistingImage(buf) {
  const sz = imageSize(buf);
  if (!sz) { console.error(`  格式 ${sniff(buf).mime}：读不出尺寸，跳过比例检查`); return; }
  const A4 = 2304 / 3264;
  const ratio = sz.w / sz.h;
  const dev = Math.abs(ratio - A4) / A4;
  console.error(`  尺寸 ${sz.w}x${sz.h}  比例 ${ratio.toFixed(3)}（A4 是 ${A4.toFixed(3)}）`);
  if (sz.h < 1600) {
    console.error('  ⚠ 高度不足 1600px，铺满 A4 会发虚 —— 换一张更大的，或接受糊一点');
  }
  if (dev > 0.08) {
    console.error(`  ⚠ 与 A4 相差 ${Math.round(dev * 100)}%，cover 铺满必然裁掉一条边：`);
    console.error('     重要内容别贴边；或改简历里的 .bg-layer 的 background-position 调取景。');
  }
}

async function generate({ apiKey, model, prompt, size, responseFormat }) {
  // output_format 必须显式给：默认会回 JPEG，存成 .png 会名不副实
  const body = { model, prompt, size, response_format: responseFormat, output_format: 'png', watermark: false };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { fail(`接口返回非 JSON（HTTP ${res.status}）：\n${text.slice(0, 800)}`); }
  if (!res.ok || json.error) {
    const e = json.error || {};
    fail([
      `调用失败 HTTP ${res.status}`,
      e.code ? `code: ${e.code}` : '',
      e.message ? `message: ${e.message}` : '',
      '',
      '常见原因：模型未开通 / API Key 无效 / size 超范围 / 余额不足。',
      '原始返回：' + text.slice(0, 600),
    ].filter(Boolean).join('\n'));
  }
  return json;
}

async function fetchImage(item) {
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item.url) {
    const r = await fetch(item.url);
    if (!r.ok) fail(`下载图片失败 HTTP ${r.status}：${item.url}`);
    return Buffer.from(await r.arrayBuffer());
  }
  fail('返回结果里既没有 b64_json 也没有 url：' + JSON.stringify(item).slice(0, 400));
}

// ---------------------------------------------------------------- 自检：解 PNG 看安全区干不干净
// 纯本地启发式：正文区若出现文字/花纹，局部梯度会明显抬高。是提示，不是保证。

function decodePng(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    const s = sniff(buf);
    fail([
      `自检只支持 PNG，这张其实是 ${s.mime}。`,
      s.ext === '.jpg'
        ? [
            '若是本脚本生成的：旧图没指定 output_format 时可能存成了 JPEG，重新跑一次生成即可（脚本已固定 output_format=png）。',
            '若是自己找的背景图：直接去掉 --check 再跑，注入一样能用 ——',
            '  node scripts/gen-background.js --image 你的图.jpg --apply 姓名-resume.html',
          ].join('\n')
        : '请换一张 PNG 再试。',
    ].join('\n'));
  }
  let pos = 8, ihdr = null, idat = [], plte = null;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = data;
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) fail('PNG 缺少 IHDR');
  if (ihdr.interlace) fail('暂不支持隔行扫描的 PNG');
  if (ihdr.depth !== 8) fail(`暂不支持 ${ihdr.depth} 位深的 PNG`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.color];
  if (!ch) fail('不支持的 PNG 颜色类型：' + ihdr.color);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = ihdr.width * ch;
  const out = Buffer.alloc(ihdr.height * stride);
  let rp = 0;
  for (let y = 0; y < ihdr.height; y++) {
    const ft = raw[rp++];
    const line = raw.subarray(rp, rp + stride); rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } else if (ft !== 0) fail('未知 PNG 滤波器：' + ft);
      cur[i] = v;
    }
  }
  return { width: ihdr.width, height: ihdr.height, ch, color: ihdr.color, plte, data: out };
}

function rgbAt(img, x, y) {
  const o = (y * img.width + x) * img.ch;
  const d = img.data;
  if (img.color === 3) { const i = d[o] * 3; return [img.plte[i], img.plte[i + 1], img.plte[i + 2]]; }
  if (img.ch === 1 || img.ch === 2) return [d[o], d[o], d[o]];
  return [d[o], d[o + 1], d[o + 2]];
}

function lumAt(img, x, y) {
  const [r, g, b] = rgbAt(img, x, y);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function zoneStats(img, r, rowStepOverride) {
  const x0 = Math.max(1, Math.round(r[0] * img.width));
  const y0 = Math.max(1, Math.round(r[1] * img.height));
  const x1 = Math.min(img.width - 3, Math.round((r[0] + r[2]) * img.width));
  const y1 = Math.min(img.height - 3, Math.round((r[1] + r[3]) * img.height));
  // 亮度统计按行抽样；边缘能量逐像素算（细笔画只有 1~2px，跳着采会整条漏掉）
  const rowStep = rowStepOverride || Math.max(1, Math.floor((y1 - y0) / 220));
  let n = 0, sum = 0, sum2 = 0, edgeSum = 0, edgeN = 0, R = 0, G = 0, B = 0;
  for (let y = y0; y < y1; y += rowStep) {
    for (let x = x0; x < x1; x++) {
      const [r, g, b] = rgbAt(img, x, y);
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += L; sum2 += L * L; R += r; G += g; B += b; n++;
      if (x + 1 < x1) { edgeSum += Math.abs(lumAt(img, x + 1, y) - L); edgeN++; }
    }
  }
  if (!n) return { mean: 0, sd: 0, edge: 0, rgb: [0, 0, 0] };
  const edge = edgeSum / Math.max(1, edgeN);
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), edge, rgb: [R / n, G / n, B / n] };
}

// 全画面网格扫描：找"内部平坦、却跟四周背景明显不同色"的格子。
// 这正是模型擅自画占位框/色块的特征，且不依赖我们对坐标的估算精度。
function scanTiles(img) {
  const N = 6, tiles = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const t = [i / N, j / N, 1 / N, 1 / N];
      const inner = zoneStats(img, t, 3);
      if (!inner.mean) continue;
      const ox = Math.max(0, t[0] - t[2] * 0.5), oy = Math.max(0, t[1] - t[3] * 0.5);
      const outer = [ox, oy, Math.min(1, t[0] + t[2] * 1.5) - ox, Math.min(1, t[1] + t[3] * 1.5) - oy];
      const ring = zoneStats(img, outer, 3);
      if (!ring.mean) continue;
      tiles.push({
        at: `${pct(t[0])}-${pct(t[0] + t[2])}% x, ${pct(t[1])}-${pct(t[1] + t[3])}% y`,
        delta: Math.max(...[0, 1, 2].map((k) => Math.abs(inner.rgb[k] - ring.rgb[k]))),
        edge: inner.edge,
      });
    }
  }
  return tiles.sort((a, b) => b.delta - a.delta);
}

function runCheck(imgBuf, meta) {
  const img = decodePng(imgBuf);
  const zones = meta ? meta.zones : { content: [0.04, 0.02, 0.92, 0.96], photo: [0.78, 0.06, 0.14, 0.12] };
  // 阈值来自 scripts/test-check.js 的实测：纯渐变 0.0、稀疏细文字 13.5、真实生成图 0.7~1.6
  const rows = [
    ['正文区 content', zones.content, 4],
    ['证件照位 photo', zones.photo, 4],
  ];
  const warns = [];
  console.error(`◑ 自检  尺寸 ${img.width}x${img.height}`);
  console.error('  区域            平均亮度   明暗标准差   边缘能量(阈值)');
  for (const [label, rect, limit] of rows) {
    const s = zoneStats(img, rect);
    const bad = s.edge > limit;
    if (bad) warns.push(`${label} 边缘能量偏高，可能被花纹或文字侵入`);
    console.error(`  ${label.padEnd(14)} ${s.mean.toFixed(1).padStart(8)} ${s.sd.toFixed(1).padStart(11)} ${s.edge.toFixed(2).padStart(10)} (${limit}) ${bad ? '⚠' : '✓'}`);
  }
  // 判据：既要"跟四周明显不同色"（delta 大），又要"内部平坦"（edge 小）。
  // 诚实说明：这条只抓得到「明显的」占位框。实测里角落的大星星/气泡也能把 delta
  // 顶到 10~14，和轻微色块（7.9）分不开 —— 所以阈值定在 20 且只当提示，不当判定。
  const tiles = scanTiles(img);
  const DELTA = 20, FLAT = 3;
  const isBlock = (t) => t.delta > DELTA && t.edge < FLAT;
  const bad = tiles.filter(isBlock);
  if (bad.length) warns.push(`有 ${bad.length} 处明显色块，疑似占位框`);
  console.error(`  最不平的格子（提示用：ΔRGB>${DELTA} 且内部平坦才算可疑）`);
  for (const t of tiles.slice(0, 3)) {
    console.error(`    ${t.at.padEnd(22)} Δ ${t.delta.toFixed(1).padStart(5)}  边缘 ${t.edge.toFixed(1).padStart(4)} ${isBlock(t) ? '⚠' : '·'}`);
  }
  if (warns.length) {
    console.error(`\n⚠ ${warns.join('；')}。\n  看图确认；必要时收紧 spec 的 decoration 栏或重跑。\n`);
  } else {
    console.error('✓ 安全区干净（启发式，只看得到明显问题，人眼仍要过一遍）\n');
  }
  return { img, warns };
}

// ---------------------------------------------------------------- 注入 HTML

function applyToHtml(imagePath, htmlPath) {
  if (!fs.existsSync(htmlPath)) fail(`找不到简历文件：${htmlPath}`);
  let html = fs.readFileSync(htmlPath, 'utf8');
  if (!html.includes('--bg-image')) {
    fail([
      `${htmlPath} 里没有 --bg-image 变量，说明它不是 assets/templates/ 里的模板。`,
      '插画模式需要模板自带的背景图层支持：请先用 assets/templates/ 里的模板作为骨架生成简历',
      '（serif / banner / editorial / sidebar / nouveau / mecha 六选一）。',
    ].join('\n'));
  }
  // 图片拷到简历同目录，用相对路径引用，保证离线可打开
  const dir = path.dirname(htmlPath);
  const dst = path.join(dir, path.basename(imagePath));
  if (path.resolve(dst) !== path.resolve(imagePath)) fs.copyFileSync(imagePath, dst);

  html = html.replace(/--bg-image\s*:\s*[^;]*;/, `--bg-image:url("${path.basename(imagePath)}");`);
  if (/\bclass\s*=\s*["'][^"']*mode-illustrated/.test(html)) {
    // 已经注入过，只换图
  // 注意：用 ^…$m 锚定行首，只认真正的 body 标签。
  // 否则 <head> 里的 CSS 注释若含字面量 "<body>"，会被 replace 的"第一个匹配"先吃掉，
  // 把 class 注进注释里 —— 背景不显示，脚本却照报"已注入"。
  } else if (/^\s*<body\s+class=/m.test(html)) {
    html = html.replace(/^(\s*)<body(\s+class=)(["'])/m, '$1<body$2$3mode-illustrated ');
  } else {
    html = html.replace(/^\s*<body([^>]*)>/m, '<body$1 class="mode-illustrated">');
  }
  fs.writeFileSync(htmlPath, html);
  console.error(`✔ 已注入插画模式：${htmlPath}  ←  ${path.basename(imagePath)}`);
}

// ---------------------------------------------------------------- 落盘

function uniquePath(dir, base, ext) {
  let p = path.join(dir, `${base}${ext}`), n = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base}-${n++}${ext}`);
  return p;
}

// ---------------------------------------------------------------- 主流程

if (require.main === module) (async function main() {
  const meta = loadTemplateMeta();
  const size = typeof opts.size === 'string' ? opts.size : (meta && meta.size) || DEFAULT_SIZE;
  const model = typeof opts.model === 'string' ? opts.model : DEFAULT_MODEL;

  if (opts['dry-run']) {
    const prompt = buildPrompt(meta);
    console.log('— 请求体（未实际调用）—\n');
    console.log(JSON.stringify({ model, size, response_format: 'b64_json', watermark: false, prompt }, null, 2));
    if (meta) console.log(`\n— 模板 ${meta.template}（${meta.label}）推导：A4 尺寸 ${meta.size} —`);
    return;
  }

  const outdir = path.resolve(process.cwd(), typeof opts.outdir === 'string' ? opts.outdir : DEFAULT_OUTDIR);
  let imgPath;

  if (typeof opts.image === 'string') {
    imgPath = path.resolve(process.cwd(), opts.image);
    if (!fs.existsSync(imgPath)) fail(`找不到 --image 指定的文件：${imgPath}`);
    console.error(`◐ 跳过生成，直接用现有图：${imgPath}`);
    describeExistingImage(fs.readFileSync(imgPath));
  } else {
    // prompt 只在实际生成时才需要：--image + --apply 这种"不生成只加工"的用法不该被它拦住
    const prompt = buildPrompt(meta);
    const apiKey = resolveApiKey();
    console.error(`◐ 生成中  model=${model}  size=${size}${meta ? `  模板=${meta.template}` : ''}`);
    const t0 = Date.now();
    const json = await generate({ apiKey, model, prompt, size, responseFormat: 'b64_json' });
    const item = (json.data || [])[0];
    if (!item) fail('接口没有返回图片：' + JSON.stringify(json).slice(0, 600));
    const buf = await fetchImage(item);

    fs.mkdirSync(outdir, { recursive: true });
    const name = typeof opts.name === 'string' ? opts.name : 'resume-bg';
    const kind = sniff(buf);
    if (kind.ext !== '.png') console.error(`⚠ 接口返回的是 ${kind.mime}，按真实格式存为 ${kind.ext}`);
    imgPath = opts.out ? path.resolve(process.cwd(), opts.out) : uniquePath(outdir, name, kind.ext);
    fs.writeFileSync(imgPath, buf);
    fs.writeFileSync(imgPath.replace(/\.[^.]+$/, '.prompt.txt'), prompt + '\n');
    console.error(`✔ 生成完成  用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  if (opts.check || opts['check-only']) {
    runCheck(fs.readFileSync(imgPath), meta);
  }

  if (typeof opts.apply === 'string') {
    applyToHtml(imgPath, path.resolve(process.cwd(), opts.apply));
  }

  console.log(imgPath);
})().catch((e) => fail(e && e.stack ? e.stack : String(e)));

// 便于测试/复用：被 require 时不自动执行
module.exports = { decodePng, zoneStats, scanTiles, lumAt, rgbAt, sniff, loadTemplateMeta, buildPrompt };
