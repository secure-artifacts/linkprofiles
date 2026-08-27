import sharp from 'sharp';

/** 一张真图，走 sharp 的真实解码路径，不是随便几个字节。 */
export function makePng(width = 800, height = 600): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 251, g: 217, b: 198 },
    },
  })
    .png()
    .toBuffer();
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.byteLength);
  new DataView(out.buffer).setUint32(0, out.byteLength);
  out.set(new TextEncoder().encode(type), 4);
  out.set(payload, 8);
  return out;
}

/**
 * 一段合法的 mp4 头：ftyp + moov/mvhd。
 *
 * 服务端只解析 mvhd 拿时长、其余原样落盘（不转码），因此这段假数据
 * 走的是与真实文件完全相同的代码路径。`padBytes` 用来把文件撑到指定大小，
 * 测大小限制时用。
 */
export function makeMp4(durationMs: number, padBytes = 0): Buffer {
  const timescale = 1000;
  const payload = new Uint8Array(20);
  const view = new DataView(payload.buffer);
  view.setUint32(12, timescale);
  view.setUint32(16, durationMs);

  const ftyp = box('ftyp', new TextEncoder().encode('isom\0\0\0isomiso2'));
  const moov = box('moov', box('mvhd', payload));
  const pad = box('free', new Uint8Array(Math.max(0, padBytes)));

  return Buffer.concat([ftyp, moov, pad].map((p) => Buffer.from(p)));
}

/** 手搓一段 multipart/form-data，省掉一个只在测试里用的依赖。 */
export function multipart(
  fields: Record<string, string>,
  files: Record<string, { filename: string; contentType: string; data: Buffer }>,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----lptest${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  for (const [name, file] of Object.entries(files)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.data,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
