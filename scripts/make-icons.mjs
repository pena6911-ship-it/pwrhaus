// Build app icons from src/img/logo.png without any image dependency.
// Node's zlib does the only hard part; PNG framing is small enough to hand-roll.
//
// The source is the full lockup (monogram + wordmark). An app icon must be the
// monogram alone — a wordmark at 180px is an illegible smudge — so the monogram
// is located by finding the white gutter between the two blocks rather than by
// hardcoding a crop that would break if the asset is ever re-exported.

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const SRC = 'src/img/logo.png';

// ---------- PNG decode (8-bit, non-interlaced, RGB or RGBA) ----------
function decodePng(buf) {
  let pos = 8, width = 0, height = 0, channels = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8], colour = data[9], interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) {
        throw new Error(`unsupported PNG: depth ${depth} colour ${colour} interlace ${interlace}`);
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, channels, data: out };
}

// ---------- PNG encode (8-bit RGB, filter 0) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- locate the monogram ----------
const src = decodePng(readFileSync(SRC));
const { width: W, height: H, channels: C, data } = src;
const px = (x, y) => {
  const i = (y * W + x) * C;
  return [data[i], data[i + 1], data[i + 2]];
};
const isInk = (x, y) => {
  const [r, g, b] = px(x, y);
  return (r + g + b) / 3 < 235; // anything meaningfully darker than the white ground
};

const rowInk = new Array(H).fill(0);
for (let y = 0; y < H; y += 1) {
  let n = 0;
  for (let x = 0; x < W; x += 1) if (isInk(x, y)) n += 1;
  rowInk[y] = n;
}

const firstInk = rowInk.findIndex((n) => n > 0);
// Find the widest blank band below the monogram — that is the gutter before the
// wordmark. Search only the middle of the image so the outer margins do not win.
let gapStart = -1, gapLen = 0, bestStart = -1, bestLen = 0;
for (let y = Math.floor(H * 0.35); y < Math.floor(H * 0.85); y += 1) {
  if (rowInk[y] === 0) {
    if (gapStart === -1) gapStart = y;
    gapLen += 1;
    if (gapLen > bestLen) { bestLen = gapLen; bestStart = gapStart; }
  } else { gapStart = -1; gapLen = 0; }
}
if (bestStart === -1) throw new Error('could not find the gutter between monogram and wordmark');

const top = firstInk;
const bottom = bestStart; // cut at the start of the gutter
let left = W, right = 0;
for (let y = top; y < bottom; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (isInk(x, y)) { if (x < left) left = x; if (x > right) right = x; }
  }
}

const cropW = right - left + 1;
const cropH = bottom - top;
console.log(`source ${W}x${H}, monogram box ${cropW}x${cropH} at (${left},${top}), gutter ${bestLen}px`);

// ---------- square canvas with padding, then box-filter downscale ----------
const PAD = 0.14;                       // keeps the mark inside Android's maskable safe zone
const side = Math.round(Math.max(cropW, cropH) * (1 + PAD * 2));
const offX = Math.round((side - cropW) / 2);
const offY = Math.round((side - cropH) / 2);
const canvas = Buffer.alloc(side * side * 3, 0xff); // white ground; iOS renders transparency as black
for (let y = 0; y < cropH; y += 1) {
  for (let x = 0; x < cropW; x += 1) {
    const [r, g, b] = px(left + x, top + y);
    const o = ((offY + y) * side + (offX + x)) * 3;
    canvas[o] = r; canvas[o + 1] = g; canvas[o + 2] = b;
  }
}

function resize(srcBuf, srcSide, dst) {
  const out = Buffer.alloc(dst * dst * 3);
  const scale = srcSide / dst;
  for (let y = 0; y < dst; y += 1) {
    const y0 = Math.floor(y * scale), y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
    for (let x = 0; x < dst; x += 1) {
      const x0 = Math.floor(x * scale), x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * srcSide + sx) * 3;
          r += srcBuf[i]; g += srcBuf[i + 1]; b += srcBuf[i + 2]; n += 1;
        }
      }
      const o = (y * dst + x) * 3;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

for (const [size, name] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png']]) {
  const buf = encodePng(size, size, resize(canvas, side, size));
  writeFileSync(`src/img/${name}`, buf);
  console.log(`wrote src/img/${name} (${size}x${size}, ${buf.length} bytes)`);
}
