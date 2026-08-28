import type { MediaSource, VideoSource } from '@link-profile/profile-ui';
import { media, type MediaRow } from '@link-profile/shared/schema';
import { inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { publicUrl } from '../media/storage.js';

/** 一次把这个人用到的几份媒体查出来，避免逐个字段发查询。 */
export async function loadMediaByIds(
  db: Db,
  ids: (string | null)[],
): Promise<Map<string, MediaRow>> {
  const wanted = ids.filter((id): id is string => id !== null);
  if (wanted.length === 0) return new Map();

  const rows = await db.select().from(media).where(inArray(media.id, wanted));
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * 缩略图地址。列表、卡片这类只需要一枚小图的地方用它。
 *
 * `toMediaSource` 刻意把缩略图挡在外面（它服务的是首屏大图），所以这里单开一个。
 * 缩略图在 `media/storage.ts` 落盘时就已经生成了。
 */
export function toThumbnailUrl(row: MediaRow | undefined): string | null {
  if (!row || row.kind !== 'image') return null;
  const thumb = row.variants.find((v) => v.thumbnail);
  return thumb ? publicUrl(thumb.path) : null;
}

/**
 * 图片 → `<picture>` 的候选源。AVIF 在前、WebP 兜底，缩略图不参与首屏。
 * `<img>` 的 src 用 WebP：不认识 AVIF 的浏览器落在这一档。
 */
export function toMediaSource(row: MediaRow | undefined): MediaSource | null {
  if (!row || row.kind !== 'image') return null;

  const full = row.variants.filter((v) => !v.thumbnail);
  const avif = full.find((v) => v.format === 'avif');
  const webp = full.find((v) => v.format === 'webp');
  const fallback = webp ?? avif;
  if (!fallback) return null;

  return {
    src: publicUrl(fallback.path),
    sources: avif ? [{ src: publicUrl(avif.path), type: avif.mimeType }] : [],
    width: fallback.width ?? undefined,
    height: fallback.height ?? undefined,
  };
}

export function toVideoSource(
  row: MediaRow | undefined,
  poster: MediaRow | undefined,
): VideoSource | null {
  if (!row || row.kind !== 'video') return null;
  const file = row.variants.find((v) => v.format === 'mp4');
  if (!file) return null;

  const posterSource = toMediaSource(poster);
  return { src: publicUrl(file.path), poster: posterSource?.src ?? null };
}
