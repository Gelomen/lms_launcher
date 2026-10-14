任务 2 简报（从 plan 逐字抽取，勿改）

### 任务 2：帧协议 `src-main/ql-host-protocol.ts`

**改什么**：新建纯函数模块（§6.5）。无 Win32、无 i18n、无汉字。

`@
export const HOST_FRAME = { HELLO: 0x01, WRITE: 0x02, RESIZE: 0x03, STOP: 0x04, READY: 0x81, DATA: 0x82, EXIT: 0x83, ERR: 0x84 } as const;
export type HostFrameType = (typeof HOST_FRAME)[keyof typeof HOST_FRAME];
export function encodeFrame(type: HostFrameType, payload: string): Buffer;
export function createFrameParser(onFrame: (type: number, payload: string) => void): (chunk: Buffer) => void;
`@

- [ ] **步骤 1：先写失败测试**（`ql-host-protocol.test.ts`）：`round_trip`、`two_frames_in_one_chunk_are_split`（粘帧）、`half_frame_waits_for_the_rest`（半帧）、`unknown_type_is_dropped_without_breaking_the_stream`、`payload_with_multibyte_utf8_survives`（按字节切，不按字符）。
- [ ] **步骤 2：跑红**：`npx vitest run src-main/ql-host-protocol.test.ts`。
- [ ] **步骤 3：实现**（`len` 用 `writeUInt32LE`；解析器按字节累积 + `subarray`，不 `toString` 半帧）。
- [ ] **步骤 4：跑绿** + G5。
- [ ] **步骤 5：Commit（主代理）**：`feat: 提权 PTY 宿主的帧协议（长度前缀 + 方向高位）`

---
