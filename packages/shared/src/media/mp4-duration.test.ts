import { describe, expect, test } from 'vitest';
import { looksLikeMp4, readMp4Info } from './mp4-duration.js';
import { rejectVideo, VIDEO_MAX_BYTES } from './limits.js';

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.byteLength);
  new DataView(out.buffer).setUint32(0, out.byteLength);
  out.set(new TextEncoder().encode(type), 4);
  out.set(payload, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

/** version 0 的 mvhd：版本与 flags、创建/修改时间各 4 字节，然后 timescale 与 duration。 */
function mvhdV0(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(20);
  const view = new DataView(payload.buffer);
  view.setUint32(0, 0); // version 0 + flags
  view.setUint32(4, 0); // creation time
  view.setUint32(8, 0); // modification time
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return box('mvhd', payload);
}

/** version 1 的 mvhd：时间戳是 64 位，duration 也是。 */
function mvhdV1(timescale: number, duration: bigint): Uint8Array {
  const payload = new Uint8Array(32);
  const view = new DataView(payload.buffer);
  view.setUint32(0, 0x01000000); // version 1 + flags
  view.setUint32(20, timescale);
  view.setBigUint64(24, duration);
  return box('mvhd', payload);
}

function mp4(...moovChildren: Uint8Array[]): Uint8Array {
  const ftyp = box('ftyp', new TextEncoder().encode('isom\0\0\0isomiso2'));
  return concat(ftyp, box('moov', concat(...moovChildren)));
}

describe('readMp4Info', () => {
  test('读出 version 0 的时长', () => {
    // timescale 600、duration 4500 即 7.5 秒
    expect(readMp4Info(mp4(mvhdV0(600, 4500)))).toEqual({ durationMs: 7500, hasAudio: false });
  });

  test('读出 version 1 的时长', () => {
    expect(readMp4Info(mp4(mvhdV1(90000, 1_350_000n)))).toEqual({
      durationMs: 15000,
      hasAudio: false,
    });
  });

  test('mvhd 前面有别的盒也能找到', () => {
    const filler = box('udta', new Uint8Array(64));
    expect(readMp4Info(mp4(filler, mvhdV0(1000, 3000)))).toEqual({
      durationMs: 3000,
      hasAudio: false,
    });
  });

  test('不是 mp4、被截断、盒结构坏了都返回 null', () => {
    expect(readMp4Info(new TextEncoder().encode('这不是视频'))).toBeNull();
    expect(readMp4Info(new Uint8Array(0))).toBeNull();
    expect(readMp4Info(mp4(mvhdV0(600, 4500)).slice(0, 20))).toBeNull();
    // 盒长度撒谎，声称比文件还大。mvhd 是最后 28 字节（8 头 + 20 负载）
    const lying = mp4(mvhdV0(600, 4500));
    new DataView(lying.buffer).setUint32(lying.byteLength - 28, 0xffffff);
    expect(readMp4Info(lying)).toBeNull();
  });

  test('timescale 为零不会除出无穷大', () => {
    expect(readMp4Info(mp4(mvhdV0(0, 4500)))).toBeNull();
  });
});

/** 一条轨道：trak > mdia > hdlr，hdlr 负载前 8 字节之后是 handler_type。 */
function trak(handler: 'soun' | 'vide'): Uint8Array {
  const payload = new Uint8Array(12);
  payload.set(new TextEncoder().encode(handler), 8);
  return box('trak', box('mdia', box('hdlr', payload)));
}

describe('音轨检测', () => {
  test('有 soun 轨道就是有声音', () => {
    const info = readMp4Info(mp4(mvhdV0(600, 4500), trak('vide'), trak('soun')));
    expect(info?.hasAudio).toBe(true);
  });

  test('只有画面轨道时是无声', () => {
    const info = readMp4Info(mp4(mvhdV0(600, 4500), trak('vide')));
    expect(info?.hasAudio).toBe(false);
  });

  test('音轨排在画面轨之前也找得到', () => {
    // 找到画面轨时不能就此收手，得继续往下走完剩下的 trak
    const info = readMp4Info(mp4(mvhdV0(600, 4500), trak('soun'), trak('vide')));
    expect(info?.hasAudio).toBe(true);
  });

  test('一条轨道都没有时按无声算，不报错', () => {
    expect(readMp4Info(mp4(mvhdV0(600, 4500)))?.hasAudio).toBe(false);
  });
});

describe('looksLikeMp4', () => {
  test('认 ftyp 开头', () => {
    expect(looksLikeMp4(mp4(mvhdV0(600, 600)))).toBe(true);
    expect(looksLikeMp4(new TextEncoder().encode('GIF89a随便什么'))).toBe(false);
    expect(looksLikeMp4(new Uint8Array(4))).toBe(false);
  });
});

describe('rejectVideo', () => {
  const ok = { mimeType: 'video/mp4', bytes: 1024, durationMs: 5000 };

  test('合规的视频不被拒', () => {
    expect(rejectVideo(ok)).toBeNull();
  });

  test('拒绝时说清楚是哪一项超了、超了多少', () => {
    const tooLong = rejectVideo({ ...ok, durationMs: 21_400 });
    expect(tooLong?.reason).toBe('duration');
    expect(tooLong?.message).toContain('15');
    expect(tooLong?.message).toContain('21.4');

    const tooBig = rejectVideo({ ...ok, bytes: VIDEO_MAX_BYTES + 5 * 1024 * 1024 });
    expect(tooBig?.reason).toBe('size');
    expect(tooBig?.message).toContain('10 MB');
    expect(tooBig?.message).toContain('15 MB');

    const wrongFormat = rejectVideo({ ...ok, mimeType: 'video/quicktime' });
    expect(wrongFormat?.reason).toBe('format');
    expect(wrongFormat?.message).toContain('video/quicktime');
  });

  test('读不出时长当作格式错误', () => {
    expect(rejectVideo({ ...ok, durationMs: null })?.reason).toBe('format');
  });
});
