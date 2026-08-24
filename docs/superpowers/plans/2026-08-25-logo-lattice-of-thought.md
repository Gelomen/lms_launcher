# Logo「思维晶格 Lattice of Thought」实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 按定稿规格把应用图标从蓝紫渐变方块替换为彩色 AI 主题图形「思维晶格」（全透明底、多尺寸 ICO），并保证 GDI+ 可加载、标题栏/任务栏深浅主题下均可辨。

**架构：** 单一事实源 `src-main/logo.svg`（定稿几何）→ 一次性构建脚本 `.temp/build-logo.mjs`（sharp 按每个目标尺寸原生光栅化 → 复用 8/25 已验证的 ICO 打包逻辑写 `.temp/icon-new.ico`）→ 替换 `src-main/icon.ico`。main.ts **零改动**（`appIconPath()` 已处理窗口/托盘取图）。

**技术栈：** Node、sharp（devDependency，SVG→RGBA）、MS ICO 容器规范（32bpp RGBA、bottom-up DIB）、vitest（node 环境，src-main/**）作为 TDD 载体——ICO 校验器正是 8/25 那次"坏容器被 GDI+ 拒载"事故的直接防线。

**规格：** `docs/superpowers/spec/2026-08-25-logo-lattice-of-thought-design.md`（commit 3b7d874）。本计划的每一步都对应规格的某节，验收项逐条落实。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src-main/logo.svg` | SVG 主稿：六棱双锥晶簇（无外围、透明底），所有尺寸档的单一几何来源 | **创建** |
| `src-main/icon.ico` | Windows 应用图标容器（16/20/24/32/48/64/128/256，32bpp alpha） | **替换** |
| `src-main/ico.test.ts` | ICO 校验器 + 新 logo 的结构性/透明性断言（TDD 载体） | **创建** |
| `.temp/build-logo.mjs` | 一次性构建：SVG → 各尺寸原生光栅化 → 预览 PNG + 新 ICO | **创建**（.temp 已 gitignore，不入库） |
| `src-main/main.ts` | — | **不动** |

## 前置事实（已核实，勿重复调查）

- `src-main/icon.ico` 现状：370,070 B，sha256 `239710d5…`（8/25 蓝紫渐变方块，结构良好但图形待替换）。
- node_modules **无** sharp/resvg/canvas → 任务 2 安装 `sharp`。
- vitest include = `['src-main/**/*.test.ts', 'src/**/*.test.ts']`，node 环境（vitest.config.ts:9）。
- ICO 打包代码（bottom-up DIB 行序、AND/XOR mask、entry 表）在 `.temp/.tmp-ico-final.mjs` 的 `makeImage()`/`entry()`——**直接复用其逻辑**，8/25 已在此机器上 GDI+ LOAD OK。
- 定稿几何（与头脑风暴浏览器最终确认一致）：viewBox 240×240；T=(120,46)，B=(120,206)；中环顶点 V_i = (120+62·cos a, 120+24·sin a)，a = i·60°−90°：
  - V0=(120.00,96.00)  V1=(173.67,108.00)  V2=(173.67,132.00)  V3=(120.00,144.00)  V4=(66.33,132.00)  V5=(66.33,108.00)
  - 上切面 F_i = polygon(T, V_i, V_{i+1})，topShades[i]；下切面 G_i = polygon(B, V_{i+1}, V_i)，botShades[i]；opacity .95。
  - 棱线：T→V_i、B→V_i 各 6 条，stroke=url(#edges)（#c3ccff→#7a68f0），width .9，opacity .8。
  - 中脊高光：line(T,B)，stroke #e8ecff，width 1.4，opacity .6。**无**光晕、**无**外围星点、**无**圆底（定稿修正）。
  - topShades = [#a4b3ff, #7f76e8, #c0a6ff, #6d64e4, #8f9dff, #5b56d4]；botShades = [#4a42a8, #2e2470, #4a42a8, #332a7e, #463da0, #2a2166]。

---

### 任务 1：SVG 主稿 `src-main/logo.svg`

**文件：**
- 创建：`src-main/logo.svg`

- [ ] **步骤 1：写入完整 SVG**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="edges" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c3ccff"/>
      <stop offset="100%" stop-color="#7a68f0"/>
    </linearGradient>
  </defs>
  <!-- 上锥：T=(120,46) 到中环各边 -->
  <polygon points="120,46 120.00,96.00 173.67,108.00" fill="#a4b3ff" opacity=".95"/>
  <polygon points="120,46 173.67,108.00 173.67,132.00" fill="#7f76e8" opacity=".95"/>
  <polygon points="120,46 173.67,132.00 120.00,144.00" fill="#c0a6ff" opacity=".95"/>
  <polygon points="120,46 120.00,144.00 66.33,132.00" fill="#6d64e4" opacity=".95"/>
  <polygon points="120,46 66.33,132.00 66.33,108.00" fill="#8f9dff" opacity=".95"/>
  <polygon points="120,46 66.33,108.00 120.00,96.00" fill="#5b56d4" opacity=".95"/>
  <!-- 下锥：B=(120,206) 到中环各边 -->
  <polygon points="120,206 173.67,108.00 120.00,96.00" fill="#4a42a8" opacity=".95"/>
  <polygon points="120,206 173.67,132.00 173.67,108.00" fill="#2e2470" opacity=".95"/>
  <polygon points="120,206 120.00,144.00 173.67,132.00" fill="#4a42a8" opacity=".95"/>
  <polygon points="120,206 66.33,132.00 120.00,144.00" fill="#332a7e" opacity=".95"/>
  <polygon points="120,206 66.33,108.00 66.33,132.00" fill="#463da0" opacity=".95"/>
  <polygon points="120,206 120.00,96.00 66.33,108.00" fill="#2a2166" opacity=".95"/>
  <!-- 棱线 -->
  <g stroke="url(#edges)" stroke-width=".9" opacity=".8">
    <line x1="120" y1="46" x2="120.00" y2="96.00"/><line x1="120" y1="46" x2="173.67" y2="108.00"/>
    <line x1="120" y1="46" x2="173.67" y2="132.00"/><line x1="120" y1="46" x2="120.00" y2="144.00"/>
    <line x1="120" y1="46" x2="66.33" y2="132.00"/><line x1="120" y1="46" x2="66.33" y2="108.00"/>
    <line x1="120" y1="206" x2="173.67" y2="108.00"/><line x1="120" y1="206" x2="173.67" y2="132.00"/>
    <line x1="120" y1="206" x2="120.00" y2="144.00"/><line x1="120" y1="206" x2="66.33" y2="132.00"/>
    <line x1="120" y1="206" x2="66.33" y2="108.00"/><line x1="120" y1="206" x2="120.00" y2="96.00"/>
  </g>
  <!-- 中脊高光 -->
  <line x1="120" y1="46" x2="120" y2="206" stroke="#e8ecff" stroke-width="1.4" opacity=".6"/>
</svg>
```

注意：上/下锥 12 个切面在投影中互相重叠、共同铺满菱形剪影（与头脑浏览器最终确认的画面一致——那是同一个公式）。

- [ ] **步骤 2：Commit**

```bash
git add src-main/logo.svg
git commit -m "feat: logo 主稿——思维晶格 Lattice of Thought（透明底矢量）"
```

---

### 任务 2：安装 sharp 并冒烟验证光栅化管线

**文件：**
- 修改：`package.json`（npm 自动加 devDependencies）

- [ ] **步骤 1：安装**

```powershell
Set-Location D:\AI\Workspace\lms_launcher
npm install -D sharp
```
预期：exit 0，package.json devDependencies 出现 `"sharp": "^0.3x.x"`。若 npm 网络失败重试一次；仍失败则报告 blocked（sharp 是 Windows prebuilt 二进制包，本环境此前 electron 等依赖安装均成功）。

- [ ] **步骤 2：冒烟——主稿 SVG 能光栅化出非空 RGBA**

```powershell
Set-Location D:\AI\Workspace\lms_launcher
node -e "import('sharp').then(async (s) => { const b = await s.default(require('fs').readFileSync('src-main/logo.svg'), {density:96}).resize(24,24,{fit:'fill'}).toFormat('raw'); console.log('bytes:', b.data.length); })"
```
预期 stdout：`bytes: 2304`（24·24·4）。命令无异常即通过。

- [ ] **步骤 3：Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add sharp for logo rasterization"
```

---

### 任务 3：ICO 校验器测试（TDD · RED）

**文件：**
- 创建：`src-main/ico.test.ts`

本任务先写会失败的测试（断言的是"新 logo 的 ico"才有的性质），运行确认 RED，为任务 4/5 铺路。8/25 事故中旧 ico 因容器畸形被 GDI+ 拒载——该校验器是结构性防线：容器字段逐条对 MS ICO 规范断言 + alpha 抽查（新 logo 必须有真透明；旧渐变方块四角必不透明）。

- [ ] **步骤 1：写入测试**

```typescript
// src-main/ico.test.ts
// ICO 容器校验器 + 思维晶格 logo 的结构/透明性断言。
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

describe('icon.ico — 思维晶格多尺寸 ICO', () => {
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

  it('alpha：256 档四角全透明，晶体中心实心（新 logo 必须是真透明底）', () => {
    const idx = f.entries.findIndex((e) => e.w === 256);
    expect(idx).toBeGreaterThanOrEqual(0);
    const off = f.entries[idx].offset;
    for (const [x, y] of [[0, 0], [255, 0], [0, 255], [255, 255]] as const) {
      expect(px(f, off, x, y)[3]).toBe(0); // 四角 alpha=0：无圆底/无光晕的定稿保证
    }
    const c = px(f, off, 128, 128);
    expect(c[3]).toBeGreaterThanOrEqual(240); // 中心（晶体投影内）实心
    // 中心偏左落在上锥切面区：蓝色系（B > R），而非旧渐变方块的纯蓝绿——宽幅校验图形确实换了
    const facet = px(f, off, 96, 88);
    expect(facet[3]).toBeGreaterThan(0);
    expect(facet[0]).toBeGreaterThan(facet[2]); // B > R
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
```

注意：16 档角点 alpha=0 —— 定稿无圆底，16px 光栅化后四角必透明；若 sharp 抗锯齿给极边缘留下微量 alpha（≤4），把对应断言放宽为 `toBeLessThanOrEqual(4)` 并在 commit message 记录原因。

- [ ] **步骤 2：运行，确认 RED**

```powershell
npx vitest run src-main/ico.test.ts
```
预期 FAIL（对当前蓝紫方块 ico）：`count` 断言失败——旧档是 6 个尺寸（16/32/48/64/128/256，期望 8 个含 20），四角 alpha 断言失败（旧图标四角不透明）。**记下精确的失败行数**作为 RED 证据。

---

### 任务 4：构建脚本——光栅化、预览、打包新 ICO

**文件：**
- 创建：`.temp/build-logo.mjs`（.temp/ 已 gitignore，不入库）

- [ ] **步骤 1：写入脚本**

```javascript
// .temp/build-logo.mjs — SVG 主稿 → 各尺寸原生光栅化 → 预览 PNG + 新 ICO。
// 打包逻辑沿用 .temp/.tmp-ico-final.mjs（8/25 GDI+ LOAD OK 版本）：
// bottom-up DIB 行、biHeight=size*2、AND mask 零填充（依赖 alpha）。
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = process.cwd(); // 从仓库根运行
const SIZES = [16, 20, 24, 32, 48, 64, 128, 256];
const svg = readFileSync(ROOT + '/src-main/logo.svg');

// ---- 每个尺寸：sharp 直接按目标像素光栅化（矢量原生，非缩放采样）----
async function rasterize(size) {
  // raw = RGBA top-down；density 96 → 240 viewBox @96dpi = 240px 基准，resize 到 size。
  const raw = await sharp(Buffer.from(svg), { density: 96 })
    .resize(size, size, { fit: 'fill' })
    .toFormat('raw');
  return { data: raw.data, w: size, h: size };
}

// ---- ICO entry：与 .tmp-ico-final.mjs 的 makeImage/entry 相同 ----
function makeImage(size, px) {
  const andRowBytes = (((size + 31) >> 5) << 2);
  const xor = Buffer.alloc(size * size * 4);
  for (let storedRow = 0; storedRow < size; storedRow++) { // bottom-up storage
    const imgY = size - 1 - storedRow;                    // image row (top-down)
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px(x, imgY);
      const k = (storedRow * size + x) * 4;
      xor[k] = b; xor[k + 1] = g; xor[k + 2] = r; xor[k + 3] = a; // BGRA
    }
  }
  const and = Buffer.alloc(andRowBytes * size, 0);
  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0); bih.writeInt32LE(size, 4); bih.writeInt32LE(size * 2, 8);
  bih.writeUInt16LE(1, 12); bih.writeUInt16LE(32, 14); bih.writeUInt32LE(0, 16);
  bih.writeUInt32LE(xor.length + and.length, 20);
  return Buffer.concat([bih, xor, and]);
}
function entry(w, h, bpp, sizeBytes, off) {
  const e = Buffer.alloc(16);
  e.writeUInt8(w >= 256 ? 0 : w, 0); e.writeUInt8(h >= 256 ? 0 : h, 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(bpp, 6);
  e.writeUInt32LE(sizeBytes, 8); e.writeUInt32LE(off, 12);
  return e;
}

const images = [];
for (const s of SIZES) {
  const img = await rasterize(s);
  // 预览 PNG：与进 ICO 的是同一像素（保真核对的物料）
  writeFileSync(ROOT + '/.temp/preview-' + s + '.png',
    await sharp(img.data, { width: s, height: s, channels: 4 })
      .toFormat('png'));
  images.push({ s, buf: makeImage(s, (x, y) => {
    const k = (y * s + x) * 4; // top-down RGBA
    return [img.data[k], img.data[k + 1], img.data[k + 2], img.data[k + 3]];
  }) });
}

let offset = 6 + images.length * 16;
const ents = [];
for (const im of images) {
  ents.push(entry(im.s, im.s, 32, im.buf.length, offset));
  offset += im.buf.length;
}
const hdr = Buffer.alloc(6);
hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(images.length, 4);
const out = Buffer.concat([hdr, ...ents, ...images.map((i) => i.buf)]);
writeFileSync(ROOT + '/.temp/icon-new.ico', out);

// RAW 自检：每个档中心像素（bottom-up 存储）应为不透明彩色
for (const im of images) {
  const k = 40 + ((Math.floor(im.s / 2) * im.s) + Math.floor(im.s / 2)) * 4;
  console.log('frame', im.s, 'center BGRA =', [im.buf[k], im.buf[k+1], im.buf[k+2], im.buf[k+3]].join(','));
}
console.log('ico bytes:', out.length);
```

- [ ] **步骤 2：运行，生成预览与新 ICO**

```powershell
Set-Location D:\AI\Workspace\lms_launcher
node .temp/build-logo.mjs
```
预期 stdout：8 行 `frame N center BGRA = …`（每行最后数字 = alpha，应 ≥240）+ `ico bytes: <n>`。若某档中心 alpha < 240 → 说明该档渲染异常，停下排查 sharp density/resize 参数，勿继续。

- [ ] **步骤 3：保真核对（规格硬门槛，人工关卡）**

由执行者把以下文件以图片形式呈现给用户目检：
`.temp/preview-256.png`、`.temp/preview-64.png`、`.temp/preview-32.png`、`.temp/preview-16.png`（对照头脑定稿画面：靛紫晶簇、透明底、无外围星）。
**用户确认"一致"后才允许进入任务 5**。若用户指出差异 → 修正 logo.svg（回到任务 1 步骤 1 的参数）重跑本任务，直到通过。

---

### 任务 5：替换 icon.ico — 测试转 GREEN + GDI+ 证据

**文件：**
- 替换：`src-main/icon.ico`

- [ ] **步骤 1：覆盖源文件**

```powershell
Copy-Item -Path D:\AI\Workspace\lms_launcher\.temp\icon-new.ico -Destination D:\AI\Workspace\lms_launcher\src-main\icon.ico -Force
(Get-FileHash D:\AI\Workspace\lms_launcher\src-main\icon.ico -Algorithm SHA256).Hash
```
记下新 sha256（后续任务 6 要与 win-unpacked 内产物比对）。

- [ ] **步骤 2：跑测试，确认 GREEN**

```powershell
npx vitest run src-main/ico.test.ts
```
预期 PASS（4 it）。这是任务 3 RED 的直接反转——若仍 FAIL，说明打包输出与校验器预期不符：回到任务 4 脚本核对 bottom-up 行序 / biHeight，修到 PASS 为止。

- [ ] **步骤 3：GDI+ LOAD OK 证据（规格非协商项，在 Windows PowerShell 执行）**

```powershell
$ico = New-Object System.Drawing.Icon 'D:\AI\Workspace\lms_launcher\src-main\icon.ico'
Write-Output ('LOAD OK: ' + $ico.Width() + 'x' + $ico.Height())
```
预期：无异常，stdout 形如 `LOAD OK: 256x256`（取最高档）。若抛 "must be a picture that can be used as an Icon" → 容器又被写坏：对照 8/25 spec 的根因 A 逐字段复查 makeImage/entry。

- [ ] **步骤 4：Commit**

```bash
git add src-main/icon.ico src-main/ico.test.ts
git commit -m "feat: icon.ico 换为思维晶格多尺寸透明底 ICO（GDI+ LOAD OK）"
```

---

### 任务 6：全量重建 + exe 级验收

**文件：** 无源码改动；产物在 `dist-release/`（已 gitignore）

- [ ] **步骤 1：类型 + 构建 + 打包**

```powershell
Set-Location D:\AI\Workspace\lms_launcher
npx tsc -p tsconfig.main.json
npm run build
npx electron-builder --win portable
```
预期：三条命令均 exit 0；产出 `dist-release/win-unpacked/lms_launcher.exe` 与 `dist-release/lms-launcher-1.0.0-portable.exe`（版本名以实际 package.json 为准）。

- [ ] **步骤 2：资源一致性——win-unpacked 内 icon.ico 与源文件同 hash**

```powershell
(Get-FileHash D:\AI\Workspace\lms_launcher\dist-release\win-unpacked\resources\icon.ico -Algorithm SHA256).Hash
```
预期 = 任务 5 步骤 1 记录的新 sha256。

- [ ] **步骤 3：exe 关联图标可提取（8/25 验收同款）**

在 Windows PowerShell 执行：

```powershell
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ExIc { [DllImport("shell32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr ExtractAssociatedIcon(string f, out IntPtr h); }
'@
foreach ($exe in @(
  'D:\AI\Workspace\lms_launcher\dist-release\win-unpacked\lms_launcher.exe',
  'D:\AI\Workspace\lms_launcher\dist-release\lms-launcher-1.0.0-portable.exe')) {
  $h = [IntPtr]::Zero
  $r = [ExIc]::ExtractAssociatedIcon($exe, [ref]$h)
  Write-Output ($exe + ' -> ' + $r + ' h=' + $h)
}
```
预期：两个 exe 均输出 `1 h=<非零值>`（0xFFFFFFFF / null = 失败，即 8/25 修复前的症状）。

- [ ] **步骤 4：全量测试 + 最终汇报物料**

```powershell
npx vitest run
```
预期：**全部 PASS**（基线 38 + 新 ico.test.ts 的 4 it = 42）。

把 `.temp/preview-128.png`（或 preview-256）与任务 5 的 GDI+ 输出一起呈现给用户作为收尾证据。无新增 commit（产物已 gitignore）。

---

## 验收对照表（规格 → 本计划）

| 规格节 | 落点 |
|---|---|
| 图形/配色参数 | 任务 1 SVG（逐字冻结） |
| src-main/logo.svg 新增 | 任务 1 |
| icon.ico 8 尺寸 32bpp alpha | 任务 4 脚本 + 任务 5 覆盖 |
| GDI+ LOAD OK / ExtractAssociatedIcon | 任务 5 步骤 3、任务 6 步骤 3 |
| 保真核对（用户目检预览） | 任务 4 步骤 3 关卡 |
| npm test 全绿 / tsc / portable 构建 | 任务 6 |
| main.ts 零改动 | 全程不触碰 |
