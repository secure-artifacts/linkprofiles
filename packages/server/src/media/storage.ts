import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MediaVariant } from '@link-profile/shared/schema';
import sharp from 'sharp';

/** 上传文件的落盘根目录，Docker 里挂成一个卷。 */
export function uploadsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR ?? 'uploads');
}

/** 对外的静态地址前缀。系统路径带 `_` 前缀，见 ADR-0003。 */
export const UPLOADS_URL_PREFIX = '/_static/uploads';

export interface StoredMedia {
  directory: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  variants: MediaVariant[];
}

/** 单张图的最长边上限，按用途给。手机直出的八兆原图不该原样进首屏。 */
export const IMAGE_MAX_EDGE = { avatar: 640, background: 1440 } as const;
export const THUMBNAIL_EDGE = 160;

/**
 * 图片处理：转 AVIF 为主、WebP 兜底，并生成一张缩略图。
 *
 * 用户直接把手机里拍的照片传上来就行，压缩在这里做完 —— 访客的首屏
 * 不该被一张八兆原图拖垮。
 */
export async function storeImage(
  buffer: Buffer,
  opts: { userId: string; mediaId: string; usage: keyof typeof IMAGE_MAX_EDGE },
): Promise<StoredMedia> {
  const directory = path.join(opts.userId, opts.mediaId);
  const absolute = path.join(uploadsDir(), directory);
  await mkdir(absolute, { recursive: true });

  const maxEdge = IMAGE_MAX_EDGE[opts.usage];
  // EXIF 里的方向信息要先转正，否则竖拍的照片会躺着。
  const base = sharp(buffer, { failOn: 'error' }).rotate();
  const meta = await base.metadata();

  const resized = base.resize({
    width: maxEdge,
    height: maxEdge,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const variants: MediaVariant[] = [];
  for (const format of ['avif', 'webp'] as const) {
    const pipeline = resized.clone();
    const out =
      format === 'avif'
        ? await pipeline.avif({ quality: 55 }).toBuffer({ resolveWithObject: true })
        : await pipeline.webp({ quality: 78 }).toBuffer({ resolveWithObject: true });

    const file = `image.${format}`;
    await writeFile(path.join(absolute, file), out.data);
    variants.push({
      format,
      mimeType: `image/${format}`,
      path: `${directory}/${file}`,
      width: out.info.width,
      height: out.info.height,
      bytes: out.data.byteLength,
    });
  }

  const thumb = await base
    .clone()
    .resize({ width: THUMBNAIL_EDGE, height: THUMBNAIL_EDGE, fit: 'cover' })
    .webp({ quality: 70 })
    .toBuffer({ resolveWithObject: true });
  await writeFile(path.join(absolute, 'thumb.webp'), thumb.data);
  variants.push({
    format: 'webp',
    mimeType: 'image/webp',
    path: `${directory}/thumb.webp`,
    width: thumb.info.width,
    height: thumb.info.height,
    bytes: thumb.data.byteLength,
    thumbnail: true,
  });

  const primary = variants[0]!;
  return {
    directory,
    width: primary.width,
    height: primary.height,
    durationMs: null,
    variants,
  };
}

/**
 * 视频处理：只落盘，不转码。
 * 运行镜像因此不需要装 ffmpeg，见 requirements 二。
 */
export async function storeVideo(
  buffer: Buffer,
  opts: { userId: string; mediaId: string; durationMs: number },
): Promise<StoredMedia> {
  const directory = path.join(opts.userId, opts.mediaId);
  const absolute = path.join(uploadsDir(), directory);
  await mkdir(absolute, { recursive: true });

  const file = 'video.mp4';
  await writeFile(path.join(absolute, file), buffer);

  return {
    directory,
    width: null,
    height: null,
    durationMs: opts.durationMs,
    variants: [
      {
        format: 'mp4',
        mimeType: 'video/mp4',
        path: `${directory}/${file}`,
        width: null,
        height: null,
        bytes: buffer.byteLength,
      },
    ],
  };
}

/** 删用户时清掉他的文件，不留孤儿，见 16。 */
export async function removeMediaDirectory(directory: string): Promise<void> {
  const absolute = path.resolve(uploadsDir(), directory);
  // 不允许跳出上传根目录
  if (!absolute.startsWith(uploadsDir() + path.sep)) return;
  await rm(absolute, { recursive: true, force: true });
}

export function publicUrl(variantPath: string): string {
  return `${UPLOADS_URL_PREFIX}/${variantPath}`;
}
