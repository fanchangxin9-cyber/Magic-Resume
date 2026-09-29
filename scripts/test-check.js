// 自检阈值的校准用例：造一张"渐变底 + 稀疏细文字"的合成图，验证自检阈值能否检出文字。
// 用完即删。
const zlib = require('node:zlib');
const { decodePng, zoneStats } = require('./gen-background.js');

const T = (() => { const t = []; for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function pngEncode(w, h, rgb) {
  const stride = w * 3;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8);
    b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const W = 800, H = 1000;
const px = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = y / H;
  const o = (y * W + x) * 3;
  px[o] = 240 - 40 * t; px[o + 1] = 235 - 30 * t; px[o + 2] = 250 - 10 * t;
}
// 在中部（正文区）画几行 1~2px 的深色"文字"笔画
for (let line = 0; line < 6; line++) {
  const y0 = 420 + line * 26;
  for (let x = 120; x < 680; x += 7) {
    const h = 14, w = 1 + ((x / 7) % 2);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const o = ((y0 + dy) * W + x + dx) * 3;
      px[o] = 40; px[o + 1] = 40; px[o + 2] = 60;
    }
  }
}

const img = decodePng(pngEncode(W, H, px));
const clean = [0.05, 0.02, 0.9, 0.30];   // 顶部纯渐变
const textual = [0.05, 0.40, 0.9, 0.25]; // 中部含"文字"
console.log('纯渐变区   edge =', zoneStats(img, clean).edge.toFixed(2));
console.log('含文字区   edge =', zoneStats(img, textual).edge.toFixed(2));
