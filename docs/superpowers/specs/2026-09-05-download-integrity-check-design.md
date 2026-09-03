# lms_launcher 更新包下载完整性校验设计

## 日期

2026-09-05

## 背景

2026-09-04 用户实测 bug：从 GitHub release（v0.2.0-rc.1-win64.zip，182,898,554 字节）下载更新包时，流式下载中途连接被断开但 body 流"正常结束"（done: true 而非抛错），downloads/lms-launcher-update.zip 只落盘 113,243,235 字节。download_update 不比对大小即返回 { ok: true }，渲染端进入 ready 态显示「重启应用」；update.exe 拿这个无效 zip（无 End Of Central Directory 签名）解压失败，更新静默失败。

另外，用户询问是否需要 MD5 校验。GitHub Releases API 的每个 asset 自带 digest 字段（sha256:...），免费可得；用 MD5 反而需要额外发布流程。故采用两级校验：

1. 大小校验（Content-Length 比对）——捕获截断/未完成下载，零成本
2. SHA-256 校验（asset digest 比对）——捕获内容损坏/篡改；digest 缺失时降级为仅大小校验（兼容老 release）

## 目标

1. download_update 在 Content-Length 已知且不匹配时判为下载失败：删半成品、返回 { ok: false }，渲染端 error 态（可重试）
2. digest（sha256）存在时，下载完成后再校验文件哈希；不匹配同样删文件报失败
3. digest 解析为纯函数（update-check.ts），可单测；文件哈希计算独立可测
4. 校验失败原因进 emitLog sys 行，便于用户从日志定位
5. 渲染端零改动：复用现有 error 态 + reason 通道

## 非目标

- 不做断点续传（失败后整包重下即可；10 分钟超时已存在）
- 不改 update.exe / updater-core（zip 完整性在写入 downloads 前已由下载方保证；update.exe 的「更新包不存在/解包失败」分支保留作兜底）
- 不做 MD5/SHA-1（GitHub 只提供 SHA-256）
- 不自动重试下载（保留用户手动「重试」按钮语义）

## 详细设计

### A. digest 解析（src-main/update-check.ts）

- LatestReleaseInfo 新增可选字段：digest?: string（仅接受 sha256: 前缀的 64 位十六进制小写值，否则视为无）
- parseLatestRelease 从匹配到的 zip asset 读取 digest：
  - 合法（/^sha256:[0-9a-f]{64}$/）→ 返回完整值（如 sha256:abc...）
  - 缺失 / 非法格式 / 其他算法（如 sha1:）→ 省略该字段（不返回）
- 既有测试的 toEqual 断言因新增可选字段需同步（无 digest 的 json 输入 → 结果仍无 digest 字段，toEqual 天然通过）

### B. 下载后校验（src-main/main.ts download_update）

download 循环结束、out.end() 与 'finish' 之后、返回 ok 之前：

1. 大小校验（仅当 total 非 null）：
   - size !== total → unlink(zipPath) → return { ok: false, reason: 下载不完整：收到 X 字节 / 预期 Y 字节，请重试 }
   - emitLog：[lms_launcher] 更新 · 下载不完整（X/Y），已删除半成品
2. 哈希校验（仅当 pendingUpdate.digest 存在）：
   - 流式计算 SHA-256（createReadStream + createHash，chunk 4MB，避免整包进内存）
   - 不匹配 → unlink(zipPath) → return { ok: false, reason: 校验失败：文件与发布版本不一致（SHA-256 不匹配），请重试 }
   - emitLog：[lms_launcher] 更新 · SHA-256 校验失败，已删除损坏文件
3. 两级均通过（或无 digest 时大小通过）→ 现状返回 { ok: true, zipPath, size }

错误文案走渲染端现有 error 态（r.reason 直接显示，12px 红字）；校验失败也删半成品，保证 downloads 不留无效 zip。

### C. 端到端行为（bug 场景回归）

1. 下载中途断流（113MB < 182MB）→ 完成时 size !== total → 删文件 + error 态 + 按钮「重试」
2. 用户点「重试」→ 重新走 download_update → 全量下载
3. 下载完整但 bit rot → SHA-256 不匹配 → 删文件 + error 态

## 边界与失败模式

| 场景 | 行为 |
|---|---|
| Content-Length 缺失（total=null）且无 digest | 维持现状（无法校验，返回 ok）——GitHub CDN 总是带 CL，此为兜底 |
| asset digest 是 sha1: 或其他算法 | 忽略（不校验哈希），大小校验仍生效 |
| 校验失败后 downloads 目录 | 半成品已删除；下次重试重新下载 |
| 哈希计算中途磁盘/文件 IO 错 | 抛错 → 现有 catch 分支（删半成品 + error 态） |
