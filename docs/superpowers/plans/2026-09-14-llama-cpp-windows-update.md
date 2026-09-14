# llama.cpp Windows 更新功能实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（- [ ]）语法来跟踪进度。

**目标：** 为 lms_launcher 添加 llama.cpp Windows 版本的自动检查与更新功能，集成到现有 UpdateModal 中。

**架构：** 新增三个主进程模块处理 GitHub API 调用、版本检测、下载解压与验证。UpdateModal.vue 扩展支持 llama.cpp 多行区域（版本选择 + 操作按钮）。日志输出到 lms_launcher 日志标签。

**技术栈：** Node.js (main process), GitHub Releases API, undici (HTTP 代理), adm-zip (解压), Electron IPC

**规格：** 在 brainstorming 阶段确定的设计决策

**配置变更：** lms_launcher.yaml 新增 llama_update 节（last_version_type, include_pre_release）

**版本类型（10 个 Windows 版本）：**
- Windows x64 (CPU)
- Windows arm64 (CPU)
- Windows arm64 (OpenCL Adreno)
- Windows x64 (CUDA 12) - 需 CUDA 12.4 DLLs
- Windows x64 (CUDA 13) - 需 CUDA 13.3 DLLs
- Windows arm64 (CUDA 13) - 需 CUDA 13.4 DLLs
- Windows x64 (Vulkan)
- Windows x64 (OpenVINO)
- Windows x64 (SYCL)
- Windows x64 (ROCm 10.0)

---

## 任务 1：创建 llama-update-version.ts（本地版本检测）

**文件：**
- 创建：src-main/llama-update-version.ts
- 测试：src-main/llama-update-version.test.ts

- [ ] **步骤 1：编写失败的测试**

创建 src-main/llama-update-version.test.ts，测试 parseLlamaVersion 函数：
- 解析 release 版本 "v0.4.0 (build b10852)" 返回 { type: 'release', version: '0.4.0', build: 10852 }
- 解析 pre-release 版本 "b10952" 返回 { type: 'prerelease', build: 10952 }
- 无法识别的格式返回 null

- [ ] **步骤 2：运行测试验证失败**

运行：npx vitest run src-main/llama-update-version.test.ts -v
预期：FAIL，模块不存在

- [ ] **步骤 3：编写实现**

创建 src-main/llama-update-version.ts，导出 LlamaVersion 接口和 parseLlamaVersion 函数。使用正则匹配两种版本格式。

- [ ] **步骤 4：运行测试验证通过**

运行：npx vitest run src-main/llama-update-version.test.ts -v
预期：PASS

- [ ] **步骤 5：Commit**

git add src-main/llama-update-version.ts src-main/llama-update-version.test.ts
git commit -m "feat: llama.cpp local version detection module"

---

## 任务 2：创建 llama-update-check.ts（GitHub API + 版本检查）

**文件：**
- 创建：src-main/llama-update-check.ts
- 测试：src-main/llama-update-check.test.ts

- [ ] **步骤 1：编写失败的测试**

测试 parseReleaseBody（从 release body 提取版本列表和下载链接）和 compareLlamaVersions（版本比较）。

- [ ] **步骤 2：运行测试验证失败**

运行：npx vitest run src-main/llama-update-check.test.ts -v
预期：FAIL

- [ ] **步骤 3：编写实现**

实现 parseReleaseBody、compareLlamaVersions、fetchLlamaReleaseInfo 函数。parseReleaseBody 需要解析 release body 中的 Windows 部分，提取版本名称和下载 URL，以及 CUDA DLLs URL。

- [ ] **步骤 4：运行测试验证通过**

运行：npx vitest run src-main/llama-update-check.test.ts -v
预期：PASS

- [ ] **步骤 5：Commit**

git add src-main/llama-update-check.ts src-main/llama-update-check.test.ts
git commit -m "feat: llama.cpp GitHub release check and version comparison"

---

## 任务 3：创建 llama-update-download.ts（下载、解压、验证）

**文件：**
- 创建：src-main/llama-update-download.ts
- 测试：src-main/llama-update-download.test.ts
- 修改：package.json（添加 adm-zip 依赖）

- [ ] **步骤 1：安装 adm-zip 依赖**

npm install adm-zip --save

- [ ] **步骤 2：编写测试**

测试下载和解压相关函数。

- [ ] **步骤 3：编写实现**

实现 downloadLlamaCpp 函数：下载主包和 CUDA DLLs（如需），解压到 llama_dir，运行 --version 验证。

- [ ] **步骤 4：运行测试验证通过**

运行：npx vitest run src-main/llama-update-download.test.ts -v
预期：PASS

- [ ] **步骤 5：Commit**

git add src-main/llama-update-download.ts src-main/llama-update-download.test.ts package.json package-lock.json
git commit -m "feat: llama.cpp download, extract and verify module"

---

## 任务 4：扩展 config.ts 支持 llama_update 配置

**文件：**
- 修改：src-main/config.ts
- 测试：src-main/config.test.ts

- [ ] **步骤 1：编写测试**

在 src-main/config.test.ts 中添加 llama_update 配置解析测试。

- [ ] **步骤 2：运行测试验证失败**

运行：npx vitest run src-main/config.test.ts -v
预期：FAIL

- [ ] **步骤 3：修改 config.ts**

在 AppConfig 接口中添加 llama_update?: LlamaUpdateConfig 字段。

- [ ] **步骤 4：运行测试验证通过**

运行：npx vitest run src-main/config.test.ts -v
预期：PASS

- [ ] **步骤 5：Commit**

git add src-main/config.ts src-main/config.test.ts
git commit -m "feat: add llama_update config support"

---

## 任务 5：主进程 IPC handlers

**文件：**
- 修改：src-main/main.ts

- [ ] **步骤 1：添加 llama.cpp 更新 IPC handlers**

添加 IPC handlers：check_llama_update, download_llama_update, save_llama_update_config, get_local_llama_version。日志格式与 lms_launcher 更新一致：[llama.cpp] 更新 · 开始下载：...

- [ ] **步骤 2：运行现有测试确保无回归**

运行：npx vitest run --run --reporter=verbose
预期：所有测试 PASS

- [ ] **步骤 3：Commit**

git add src-main/main.ts
git commit -m "feat: llama.cpp update IPC handlers"

---

## 任务 6：渲染端 IPC 封装

**文件：**
- 修改：src/ipc.ts

- [ ] **步骤 1：添加 llama.cpp 更新 IPC 调用**

添加 checkLlamaUpdate, downloadLlamaUpdate, saveLlamaUpdateConfig, getLocalLlamaVersion, onLlamaUpdateProgress。

- [ ] **步骤 2：运行测试确保无回归**

运行：npx vitest run --run --reporter=verbose
预期：所有测试 PASS

- [ ] **步骤 3：Commit**

git add src/ipc.ts
git commit -m "feat: llama.cpp update IPC client"

---

## 任务 7：扩展 UpdateModal.vue

**文件：**
- 修改：src/modules/UpdateModal.vue
- 测试：src/modules/UpdateModal.test.ts

- [ ] **步骤 1：编写测试**

在 src/modules/UpdateModal.test.ts 中添加 llama.cpp 行渲染测试，包含版本选择器和 pre-release 勾选框。

- [ ] **步骤 2：运行测试验证失败**

运行：npx vitest run src/modules/UpdateModal.test.ts -v
预期：FAIL

- [ ] **步骤 3：修改 UpdateModal.vue**

扩展 Item 类型支持 llama.cpp 特有字段（isLlamaCpp, versionOptions, selectedVersionType, includePreRelease, localVersion）。添加版本选择下拉框和 pre-release 勾选框（第二行）。按钮与项目名同行，布局与 lms_launcher 一致。downloading 状态按钮显示为进度条（复用现有样式）。

- [ ] **步骤 4：运行测试验证通过**

运行：npx vitest run src/modules/UpdateModal.test.ts -v
预期：PASS

- [ ] **步骤 5：Commit**

git add src/modules/UpdateModal.vue src/modules/UpdateModal.test.ts
git commit -m "feat: UpdateModal llama.cpp version selector support"

---

## 任务 8：App.vue 集成 llama.cpp 更新逻辑

**文件：**
- 修改：src/App.vue
- 测试：src/App.test.ts

- [ ] **步骤 1：编写测试**

在 src/App.test.ts 中添加 llama.cpp 更新流程测试：启动时检查、版本选择、更新下载。

- [ ] **步骤 2：运行测试验证失败**

运行：npx vitest run src/App.test.ts -v
预期：FAIL

- [ ] **步骤 3：修改 App.vue**

集成 llama.cpp 更新状态管理、版本检测、更新检查。启动时自动检测本地版本并检查更新。支持版本类型选择和 pre-release 勾选。

- [ ] **步骤 4：运行测试验证通过**

运行：npx vitest run src/App.test.ts -v
预期：PASS

- [ ] **步骤 5：Commit**

git add src/App.vue src/App.test.ts
git commit -m "feat: App llama.cpp update integration"

---

## 任务 9：验证与清理

- [ ] **步骤 1：运行全部测试**

运行：npx vitest run --run --reporter=verbose
预期：所有测试 PASS

- [ ] **步骤 2：构建验证**

运行：npm run build
预期：构建成功

- [ ] **步骤 3：提交所有变更**

git status
git add -A
git commit -m "feat: complete llama.cpp Windows update functionality"

---

## 自检清单

- [ ] 所有设计决策已实现（版本选择、pre-release、CUDA DLLs、代理、进度、日志、版本检测）
- [ ] 日志输出格式与 lms_launcher 更新一致
- [ ] UpdateModal 布局与 lms_launcher 一致（按钮与项目名同行）
- [ ] 下载中按钮显示为进度条
- [ ] 配置文件持久化 llama_update 设置
- [ ] GitHub API 走代理
- [ ] 版本验证通过 llama-server --version
- [ ] 所有测试通过
- [ ] 构建成功
