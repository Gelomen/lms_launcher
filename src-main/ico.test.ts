// src-main/ico.test.ts
// ICO 容器校验器 + 电源块 logo（2026-09-01 换：平涂紫 #8B5CF6 上块 + 渐变深蓝 #312E81→#191B5C 主体）的结构/透明性断言。
// 8/25 事故（docs/superpowers/spec/2026-08-25-exe-and-titlebar-logo-fix.md）：
// 旧 icon.ico 容器字段互相矛盾 → Windows GDI+ 拒载。本测试是其结构性防线：
// planes/bpp/dataOffset/AND-mask 逐条对 MS ICO 规范断言，外加 alpha 抽查。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ICO_PATH = path.resolve(__dirname, 'icon.ico');

interface IcoFile {
  count: number;
  entries: { w: number; h: number; planes: number; bpp: number; sizeBytes: number; offset: number }[];
  buf: Buffer;
}

export function parseIco(buf: Buffer): IcoFile {
  const count = buf.readUInt16LE(4); // header: [0-1] reserved=0, [2-3] type, [4-5] count
  const entries = [];
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16; // ICONDIR entry table follows 6-byte header
    const w = buf[o] === 0 ? 256 : buf[o]; // 0 → 256
    const h = buf[o + 1] === 0 ? 256 : buf[o + 1];
    const planes = buf.readUInt16LE(o + 4);
    const bpp = buf.readUInt16LE(o + 6);
    const sizeBytes = buf.readUInt32LE(o + 8);
    const offset = buf.readUInt32LE(o + 12);
    entries.push({ w, h, planes, bpp, sizeBytes, offset });
  }
  return { count, entries, buf };
}

// DIB 行存储（bottom-up）取像素：imgX, imgY 是图像坐标（top-down）。
function px(f: IcoFile, entryOffset: number, x: number, y: number): [number, number, number, number] {
  const w = f.buf.readUInt32LE(entryOffset + 4); // biWidth
  const storedRow = w - 1 - y;                    // bottom-up storage slot
  const k = entryOffset + 40 + (storedRow * w + x) * 4; // 40-byte BITMAPINFOHEADER, then XOR data
  return [f.buf[k], f.buf[k + 1], f.buf[k + 2], f.buf[k + 3]]; // B,G,R,A
}

describe('icon.ico — 电源块多尺寸 ICO', () => {
  const f = parseIco(readFileSync(ICO_PATH));

  it('容器：8 个尺寸档、按 16→256 升序、全部 32bpp + planes=1', () => {
    expect(f.count).toBe(8);
    const sizes = f.entries.map((e) => e.w);
    expect(sizes).toEqual([16, 20, 24, 32, 48, 64, 128, 256]);
    for (const e of f.entries) {
      expect(e.bpp).toBe(32);
      expect(e.planes).toBe(1);
      expect(e.h).toBe(e.w); // height 0→256 已在 parser 解出，非零档必须方形
    }
  });

  it('每个 entry 的 BITMAPINFOHEADER + XOR/AND mask 尺寸自洽（8/25 事故防线）', () => {
    for (const e of f.entries) {
      const biSize = f.buf.readUInt32LE(e.offset);
      expect(biSize).toBe(40);
      const biW = f.buf.readInt32LE(e.offset + 4);
      const biH = f.buf.readInt32LE(e.offset + 8);
      expect(biW).toBe(e.w);
      expect(biH).toBe(e.w * 2); // positive biHeight = bottom-up
      // XOR(w·w·4) + AND(行对齐×高) = sizeBytes（规范：AND mask 每行 (w+31)>>5<<2 字节）
      const andRow = ((e.w + 31) >> 5) << 2;
      expect(e.sizeBytes).toBe(e.w * e.w * 4 + andRow * e.w);
      // dataOffset + sizeBytes 不得越界
      expect(e.offset + e.sizeBytes).toBeLessThanOrEqual(f.buf.length);
    }
  });

  it('alpha：256 档四角全透明，主体中心实心（新 logo 必须是真透明底）', () => {
    const idx = f.entries.findIndex((e) => e.w === 256);
    expect(idx).toBeGreaterThanOrEqual(0);
    const off = f.entries[idx].offset;
    for (const [x, y] of [[0, 0], [255, 0], [0, 255], [255, 255]] as const) {
      expect(px(f, off, x, y)[3]).toBe(0); // 四角 alpha=0：无圆底/无光晕的定稿保证
    }
    const c = px(f, off, 128, 127);
    expect(c[3]).toBeGreaterThanOrEqual(240); // 中心（斜条带内）实心
    // 中心落在深蓝渐变主体中段：R≈G、B 明显高（#312E81→#191B5C 中段）
    expect(c[0]).toBeGreaterThan(c[2]); // B > R
    expect(Math.abs(c[0] - c[1])).toBeLessThan(80);
    // 上部偏左落在平涂紫块（#8B5CF6 → B≈246 G≈92 R≈139）：宽幅校验图形确实换了
    const facet = px(f, off, 86, 38);
    expect(facet[3]).toBeGreaterThan(0);
    expect(facet[2]).toBeGreaterThan(100); // R 高（紫）
    expect(facet[0]).toBeGreaterThan(200); // B 高（紫）
    expect(facet[1]).toBeLessThan(150);   // G 中
  });

  it('16 档同样是 32bpp 透明底（标题栏最小档）', () => {
    const idx = f.entries.findIndex((e) => e.w === 16);
    expect(idx).toBeGreaterThanOrEqual(0);
    const off = f.entries[idx].offset;
    for (const [x, y] of [[0, 0], [15, 15]] as const) {
      expect(px(f, off, x, y)[3]).toBe(0);
    }
  });
});