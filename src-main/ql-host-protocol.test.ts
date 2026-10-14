// src-main/ql-host-protocol.test.ts
// 任务 2：帧协议的测试（规格 §6.5「帧」：type:u8 | len:u32LE | payload；高位 0x80 区分方向；
// 解析器必须能处理粘帧 / 半帧——解析器形状见 .temp/ql-admin-probe/child9.cjs:8-17 的 feed()）。
// 用例名逐字取 plan 任务 2 步骤 1（check 表 E1-E4 的守测试）。
// 无汉字字面量（索引 G6）：多字节 UTF-8 用拉丁扩展 / 符号 / emoji 覆盖，不用 CJK。
import { describe, expect, it } from 'vitest';
import { HOST_FRAME, encodeFrame, createFrameParser, type HostFrameType } from './ql-host-protocol';

interface Frame {
  type: number;
  payload: string;
}

// 收集解析器回调：每条用例都从这里读「解析器实际吐出了什么」
function collector(): { got: Frame[]; feed: (chunk: Buffer) => void } {
  const got: Frame[] = [];
  const feed = createFrameParser((type, payload) => {
    got.push({ type, payload });
  });
  return { got, feed };
}

// 未知 type 不在 HostFrameType 的取值域内，构造时按协议层的 u8 传入
const rawFrame = (type: number, payload: string): Buffer =>
  encodeFrame(type as unknown as HostFrameType, payload);

describe('ql-host-protocol 帧协议（规格 §6.5）', () => {
  it('round_trip', () => {
    // C1：八个 type 值逐字（规格 §6.5 的帧表）
    expect(HOST_FRAME).toEqual({
      HELLO: 0x01, WRITE: 0x02, RESIZE: 0x03, STOP: 0x04,
      READY: 0x81, DATA: 0x82, EXIT: 0x83, ERR: 0x84,
    });
    // 高位 0x80 区分方向：主进程 → 宿主都 < 0x80，宿主 → 主进程都 >= 0x80
    for (const t of [HOST_FRAME.HELLO, HOST_FRAME.WRITE, HOST_FRAME.RESIZE, HOST_FRAME.STOP]) {
      expect(t & 0x80).toBe(0);
    }
    for (const t of [HOST_FRAME.READY, HOST_FRAME.DATA, HOST_FRAME.EXIT, HOST_FRAME.ERR]) {
      expect(t & 0x80).toBe(0x80);
    }

    const payloads = ['', '{}', '{"token":"t","cols":80,"rows":24}', 'echo:dir\r\n'];
    for (const [name, type] of Object.entries(HOST_FRAME) as [string, HostFrameType][]) {
      for (const payload of payloads) {
        const bytes = Buffer.from(payload, 'utf8');
        const frame = encodeFrame(type, payload);
        // C2：type:u8 | len:u32LE | payload
        expect(frame.length, name).toBe(5 + bytes.length);
        expect(frame.readUInt8(0), name).toBe(type);
        expect(frame.readUInt32LE(1), name).toBe(bytes.length);
        expect(frame.subarray(5).equals(bytes), name).toBe(true);
        // 编出来直接喂解析器 = 原样回来
        const { got, feed } = collector();
        feed(frame);
        expect(got, name).toEqual([{ type, payload }]);
      }
    }
  });

  it('two_frames_in_one_chunk_are_split', () => {
    const a = encodeFrame(HOST_FRAME.WRITE, 'dir\r');
    const b = encodeFrame(HOST_FRAME.DATA, 'a\r\nb\r\n');
    const { got, feed } = collector();
    // 粘帧：两帧在一个 chunk 里 → 按顺序拆成两帧，不合并、不吞第二帧
    feed(Buffer.concat([a, b]));
    expect(got).toEqual([
      { type: HOST_FRAME.WRITE, payload: 'dir\r' },
      { type: HOST_FRAME.DATA, payload: 'a\r\nb\r\n' },
    ]);
    // 三帧连在一起（含空 payload 帧 + 一个未知帧）同样逐帧拆开，未知帧被丢弃
    feed(Buffer.concat([encodeFrame(HOST_FRAME.STOP, ''), rawFrame(0x05, 'x'), encodeFrame(HOST_FRAME.EXIT, '{"code":0}')]));
    expect(got.slice(2)).toEqual([
      { type: HOST_FRAME.STOP, payload: '' },
      { type: HOST_FRAME.EXIT, payload: '{"code":0}' },
    ]);
    expect(got.length).toBe(4);
  });

  it('half_frame_waits_for_the_rest', () => {
    const payload = 'ping-pong-'.repeat(8);
    const frame = encodeFrame(HOST_FRAME.WRITE, payload);
    // 半帧：在每一个可能的字节切点断开，前半不得产出任何帧，补上后半才恰好一帧
    for (let cut = 0; cut < frame.length; cut++) {
      const { got, feed } = collector();
      feed(frame.subarray(0, cut));
      expect(got, `cut=${cut}`).toEqual([]);
      feed(frame.subarray(cut));
      expect(got, `cut=${cut}`).toEqual([{ type: HOST_FRAME.WRITE, payload }]);
    }
    // 逐字节喂（最碎的半帧形态）仍只产出一帧，且不重复吐
    const { got, feed } = collector();
    for (let i = 0; i < frame.length; i++) feed(frame.subarray(i, i + 1));
    expect(got).toEqual([{ type: HOST_FRAME.WRITE, payload }]);
    // 空 chunk 不改变状态
    feed(Buffer.alloc(0));
    expect(got.length).toBe(1);
  });

  it('unknown_type_is_dropped_without_breaking_the_stream', () => {
    const known = encodeFrame(HOST_FRAME.DATA, 'still-streaming');
    // 未知 type：0x00 / 已定义段之外的 0x05 / 0x7f，以及高位段的 0x80 / 0x85 / 0xff
    for (const t of [0x00, 0x05, 0x7f, 0x80, 0x85, 0xff]) {
      const { got, feed } = collector();
      feed(Buffer.concat([rawFrame(t, 'junk'), known]));
      expect(got, `type=0x${t.toString(16)}`).toEqual([{ type: HOST_FRAME.DATA, payload: 'still-streaming' }]);
    }
    // 未知帧本身被半帧截断：不得误报，补全后仍只丢弃它
    const junk = rawFrame(0x05, 'junk-junk');
    const { got, feed } = collector();
    feed(junk.subarray(0, 9));
    expect(got).toEqual([]);
    feed(Buffer.concat([junk.subarray(9), known]));
    expect(got).toEqual([{ type: HOST_FRAME.DATA, payload: 'still-streaming' }]);
  });

  it('payload_with_multibyte_utf8_survives', () => {
    // 2 / 3 / 4 字节 UTF-8 混合（带重音拉丁 = 2、符号 = 3、emoji = 4）
    const payload = 'café ☕ 😀 → ñ';
    const bytes = Buffer.from(payload, 'utf8');
    expect(bytes.length).toBeGreaterThan(payload.length); // 确证是多字节 payload
    const frame = encodeFrame(HOST_FRAME.DATA, payload);
    // len 是字节数，不是字符数（按字节切，不按字符）
    expect(frame.readUInt32LE(1)).toBe(bytes.length);
    expect(frame.length).toBe(5 + bytes.length);
    // 在多字节序列内部的每个字节切点断开：半帧不得产出，补全后逐字节还原
    for (let cut = 5; cut < frame.length; cut++) {
      const { got, feed } = collector();
      feed(frame.subarray(0, cut));
      expect(got, `cut=${cut}`).toEqual([]);
      feed(frame.subarray(cut));
      expect(got, `cut=${cut}`).toEqual([{ type: HOST_FRAME.DATA, payload }]);
    }
  });
});
