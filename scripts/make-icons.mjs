// Generates the PWA / iOS home-screen icons (no image libraries needed).
// Usage: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Sky gradient, sun, two mountain ridges with snow, a winding trail. `pad` shrinks art for maskable. */
function draw(size, pad = 0) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 4; // supersampling
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u0 = (px + (sx + 0.5) / S) / size;
          const v0 = (py + (sy + 0.5) / S) / size;
          const u = (u0 - pad) / (1 - 2 * pad);
          const v = (v0 - pad) / (1 - 2 * pad);
          let c = mix([255, 196, 120], [36, 84, 120], Math.min(1, Math.max(0, v * 1.4)));
          if ((u - 0.7) ** 2 + (v - 0.3) ** 2 < 0.012) c = [255, 236, 170];
          const back = 0.62 - 0.32 * Math.max(0, 1 - Math.abs(u - 0.32) / 0.42);
          if (v > back) c = [58, 92, 84];
          const front = 0.72 - 0.38 * Math.max(0, 1 - Math.abs(u - 0.62) / 0.5);
          if (v > front) {
            c = v < 0.43 ? [240, 244, 246] : [28, 64, 40];
          }
          const trailX = 0.5 + 0.12 * Math.sin(v * 18);
          if (v > 0.66 && Math.abs(u - trailX) < 0.018 + (v - 0.66) * 0.04) c = [255, 122, 0];
          if (u < 0 || u > 1 || v < 0 || v > 1) c = [20, 35, 26];
          acc = acc.map((a, i) => a + c[i]);
        }
      }
      const o = (py * size + px) * 4;
      buf[o] = acc[0] / (S * S);
      buf[o + 1] = acc[1] / (S * S);
      buf[o + 2] = acc[2] / (S * S);
      buf[o + 3] = 255;
    }
  }
  return png(size, buf);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/apple-touch-icon.png', draw(180));
writeFileSync('public/icons/icon-192.png', draw(192));
writeFileSync('public/icons/icon-512.png', draw(512));
writeFileSync('public/icons/icon-maskable-512.png', draw(512, 0.1));
console.log('icons written to public/icons');
