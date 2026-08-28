/**
 * 从 mp4 的盒结构里读出时长与「有没有音轨」。
 *
 * 视频**不做服务端转码**，运行镜像因此不装 ffmpeg（见 requirements 二）。
 * 但「时长超限要给出说明具体原因的错误」仍然要求服务端知道时长，
 * 所以这里只解析元数据盒 —— 它们就在文件头部，不需要解码任何一帧。
 *
 * 盒结构：`[4 字节大小][4 字节类型][负载]`。`moov` 是容器，`mvhd` 里
 * 有 timescale 与 duration，两者相除即秒数；每条轨道是一个 `trak`，
 * 它的 `mdia/hdlr` 里记着这条轨道是画面（`vide`）还是声音（`soun`）。
 */

const NOT_FOUND = null;

export interface Mp4Info {
  durationMs: number;
  /** 视频头像的静音按钮点了有没有反应，取决于它 */
  hasAudio: boolean;
}

function readBoxes<T>(
  buffer: Uint8Array,
  start: number,
  end: number,
  visit: (type: string, payloadStart: number, payloadEnd: number) => T | null,
): T | null {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = start;

  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(
      buffer[offset + 4]!,
      buffer[offset + 5]!,
      buffer[offset + 6]!,
      buffer[offset + 7]!,
    );
    let headerSize = 8;

    if (size === 1) {
      // 64 位长度，放在类型之后
      if (offset + 16 > end) return NOT_FOUND;
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      size = high * 2 ** 32 + low;
      headerSize = 16;
    } else if (size === 0) {
      // 一直到文件末尾
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) return NOT_FOUND;

    const found = visit(type, offset + headerSize, offset + size);
    if (found) return found;

    offset += size;
  }

  return NOT_FOUND;
}

/**
 * moov 底下有没有一条 handler 为 `soun` 的轨道。
 *
 * `readBoxes` 遇到 null 会继续找下一个盒，所以视频轨返回 null 之后
 * 它会自己走到下一条 trak，不需要在这里手动遍历。
 */
function hasAudioTrack(buffer: Uint8Array, moovStart: number, moovEnd: number): boolean {
  const found = readBoxes(buffer, moovStart, moovEnd, (type, trakStart, trakEnd) => {
    if (type !== 'trak') return null;

    return readBoxes(buffer, trakStart, trakEnd, (mdiaType, mdiaStart, mdiaEnd) => {
      if (mdiaType !== 'mdia') return null;

      return readBoxes(buffer, mdiaStart, mdiaEnd, (hdlrType, hdlrStart) => {
        if (hdlrType !== 'hdlr') return null;
        // hdlr 负载：version(1) + flags(3) + pre_defined(4) + handler_type(4)
        const at = hdlrStart + 8;
        if (at + 4 > buffer.byteLength) return null;
        const handler = String.fromCharCode(
          buffer[at]!,
          buffer[at + 1]!,
          buffer[at + 2]!,
          buffer[at + 3]!,
        );
        return handler === 'soun' ? true : null;
      });
    });
  });

  return found === true;
}

/** 认不出来（不是 mp4、盒结构坏了、被截断）就返回 null，由调用方当作格式错误。 */
export function readMp4Info(buffer: Uint8Array): Mp4Info | null {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  return readBoxes(buffer, 0, buffer.byteLength, (type, payloadStart, payloadEnd) => {
    if (type !== 'moov') return null;

    const duration = readBoxes(buffer, payloadStart, payloadEnd, (innerType, innerStart) => {
      if (innerType !== 'mvhd') return null;
      if (innerStart + 4 > buffer.byteLength) return null;

      const version = buffer[innerStart]!;
      // version 0：32 位时间戳；version 1：64 位。timescale 与 duration 紧随创建/修改时间之后。
      const base = innerStart + 4 + (version === 1 ? 16 : 8);
      if (version === 1) {
        if (base + 12 > buffer.byteLength) return null;
        const timescale = view.getUint32(base);
        const high = view.getUint32(base + 4);
        const low = view.getUint32(base + 8);
        if (timescale === 0) return null;
        return { durationMs: Math.round(((high * 2 ** 32 + low) / timescale) * 1000) };
      }

      if (base + 8 > buffer.byteLength) return null;
      const timescale = view.getUint32(base);
      const duration = view.getUint32(base + 4);
      if (timescale === 0) return null;
      return { durationMs: Math.round((duration / timescale) * 1000) };
    });

    if (!duration) return null;
    return {
      durationMs: duration.durationMs,
      hasAudio: hasAudioTrack(buffer, payloadStart, payloadEnd),
    };
  });
}

/** mp4 的文件头总以 `ftyp` 盒开始。 */
export function looksLikeMp4(buffer: Uint8Array): boolean {
  if (buffer.byteLength < 12) return false;
  return (
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70 // 'ftyp'
  );
}
