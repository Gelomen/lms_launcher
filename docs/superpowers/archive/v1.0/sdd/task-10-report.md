# 任务 10 报告：release portable exe（自动化部分）

**状态：✅ DONE（自动化范围内）**

## ① 全量测试

```
Test Files  3 passed (3)
     Tests  20 passed (20)
```
config 10 + build 6 + process 4 = 20/20 PASS，与任务 5 后基线一致。

## ② icon 打包态修复（I-1）

**根因**：main.ts `createTray` 用 `join(__dirname,'..','src-main','icon.ico')`，
asar 内 __dirname = `resources/app.asar/dist-main` → 解析到
`resources/app.asar/src-main/icon.ico`（不存在）。

**修复方案（a）**：electron-builder **extraResources** 把 icon.ico 拷到
asar 外的 `resources/icon.ico`；main.ts 改为：

```ts
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.ico')
  : join(__dirname, '..', 'src-main', 'icon.ico');
const icon = nativeImage.createFromPath(iconPath);
```

**附加修复（icon 尺寸）**：原 icon.ico 仅 16x16，electron-builder 要求 ≥256px。
用 Node.js 重做了 256x256 BGRA ICO（蓝白渐变+白边框，270,398 bytes）。

**exe 自身图标**：electron-builder.yml `win.icon: src-main/icon.ico` 已指向同一文件，
portable exe 的 PE 资源内嵌此图标。

## ③ dist-main 残留清理

删除（git 提交前手动 rm + 构建时 tsc 不再产出）：
- dist-main/build.test.js
- dist-main/config.test.js
- dist-main/process.test.js
- dist-main/test-utils.js

**防再生**：tsconfig.main.json exclude 更新为：
```json
"exclude": ["src-main/**/*.test.ts", "src-main/test-utils.ts"]
```
`npm run build` 后 dist-main/ 仅含 5 个文件（build/config/main/preload/process）。

**asar 验证**：`npx asar list app.asar | grep test` → 无项目 test 产物
（仅 `node_modules/yaml/dist/test-events.js`，是 yaml 包自身的合法文件）。

## ④ electron-builder portable exe

**electron-builder.yml**（重写）：
```yaml
appId: com.lms.launch
productName: lms_launch
directories:
  output: dist-release
files:
  - dist/**
  - dist-main/**
  - package.json
  - "!dist-main/*.test.js"
  - "!dist-main/test-utils.js"
asar: true
electronDist: node_modules/electron/dist   # 避免 electron 下载超时
extraResources:
  - from: src-main/icon.ico
    to: icon.ico
win:
  target: portable
  icon: src-main/icon.ico
portable:
  artifactName: "lms-launch-${version}-portable.exe"
```

**package.json**：加 `"version": "1.0.0"`。

**构建结果**：
- `npx electron-builder --win portable` → **exit 0**
- ```
  -rwxr-xr-x 1 Gelomen 197609 70874812 dist-release/lms-launch-1.0.0-portable.exe
  ```
- exe 绝对路径：`D:\AI\Workspace\lms_launch\.worktrees\lms-launch-v1\dist-release\lms-launch-1.0.0-portable.exe`

**asar 内容确认**（关键条目）：
```
\\dist-main\build.js / config.js / main.js / preload.js / process.js   # 仅 5 个，无 test
\\dist\index.html + assets/                                            # 渲染端
\\package.json
```
asar 外：`resources/icon.ico`（270KB）+ `elevate.exe`

## ⑤ commit

```
9097c26 feat: v1 release——electron-builder portable exe + icon 打包态 + dist-main 清理
210b547 feat: 系统托盘（§4.6）——启动/退出菜单 + tray-exit-request + 关闭隐藏到托盘
```

未提交最终 'v1完整' commit（留给人工验收后）。

## 修改文件清单

| 文件 | 操作 |
|------|------|
| `src-main/main.ts` | 修改：createTray iconPath 改 app.isPackaged 分支 |
| `src-main/icon.ico` | 重做：256x256 BGRA ICO（原为 16x16） |
| `electron-builder.yml` | 重写：加 asar/electronDist/extraResources/files 排除 |
| `package.json` | 修改：加 `"version": "1.0.0"` |
| `tsconfig.main.json` | 修改：exclude 加 `src-main/test-utils.ts` |

## 疑虑 / 注意事项

1. **icon 是程序化生成的占位图**（蓝白渐变），非设计稿。如需正式图标，
   替换 src-main/icon.ico 后重新 `npx electron-builder --win portable` 即可。

2. **electronDist 指向本地 node_modules/electron/dist**：这是为了绕开
   electron-builder 下载 Electron runtime（第一次超时 10min）。
   如果后续 CI/CD 没有这个目录，需要去掉该行或设 ELECTRON_MIRROR。

3. **asar 内 node_modules 较大**（@babel/vue/yaml 等全量打入），
   portable exe 67.6 MB 是合理的；如需瘦身可加 `asarUnpack` +
   electron-builder files 排除规则，但功能上目前无问题。

4. **未做人工 GUI 视觉验收**（§4.1–4.6）——按任务要求移交用户/控制者。
   exe 已落盘，可双击打开验证窗口是否渲染 dist/index.html。
