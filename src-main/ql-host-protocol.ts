// src-main/ql-host-protocol.ts
// 任务 2：提权 PTY 宿主的帧协议（规格 §6.5「帧」）。纯函数模块：不 import electron / koffi / i18n，
// 不含汉字字面量（索引 G6），不抛错（索引 G1：本模块没有可分类的失败，错误分类在 §6.7 / §6.10）。
// 帧：type:u8 | len:u32LE | payload —— len 是 payload 的**字节**数，不是字符数（规格 §6.5）。
// 高位 0x80 区分方向：主进程 → 宿主 = 0x01..0x04，宿主 → 主进程 = 0x81..0x84。
// 解析器按字节累积 + subarray，半帧不 toString、不产出；粘帧逐帧拆；未知 type 丢弃且不破坏流。
// 解析器形状照搬 .temp/ql-admin-probe/child9.cjs:8-17 的 feed()（规格 §3-P10 实测过粘帧 / 半帧）。
// 消费方：任务 4 的主进程侧管道读（ql-elevated.ts）、任务 5 的宿主入口（ql-pty-host.ts）。

export const HOST_FRAME = { HELLO: 0x01, WRITE: 0x02, RESIZE: 0x03, STOP: 0x04, READY: 0x81, DATA: 0x82, EXIT: 0x83, ERR: 0x84 } as const;

export type HostFrameType = (typeof HOST_FRAME)[keyof typeof HOST_FRAME];

// type(1) + len(4)
const HEADER_LEN = 5;

// 解析器只放行协议定义过的 type（未知 type 丢弃，规格 §6.5 / check E4）
const KNOWN_TYPES: ReadonlySet<number> = new Set<number>(Object.values(HOST_FRAME));

export function encodeFrame(type: HostFrameType, payload: string): Buffer {
  const body = Buffer.from(payload, 'utf8');
  const frame = Buffer.alloc(HEADER_LEN + body.length);
  frame.writeUInt8(type, 0);
  frame.writeUInt32LE(body.length, 1);
  body.copy(frame, HEADER_LEN);
  return frame;
}

export function createFrameParser(onFrame: (type: number, payload: string) => void): (chunk: Buffer) => void {
  let buf = Buffer.alloc(0);
  return (chunk: Buffer): void => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= HEADER_LEN) {
      const type = buf.readUInt8(0);
      const len = buf.readUInt32LE(1);
      // 半帧（含只有半截头的情况）：留在 buf 里等后续，不 toString、不产出
      if (buf.length < HEADER_LEN + len) break;
      const payload = buf.subarray(HEADER_LEN, HEADER_LEN + len).toString('utf8');
      buf = buf.subarray(HEADER_LEN + len);
      if (KNOWN_TYPES.has(type)) onFrame(type, payload);
    }
  };
}
