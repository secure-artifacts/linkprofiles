import { randomUUID } from 'node:crypto';
import { buttons, media, profiles, type MediaVariant } from '@link-profile/shared/schema';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { copyMediaDirectory, removeMediaDirectory } from '../media/storage.js';

export interface DuplicateProfileInput {
  shortName: string;
  displayName: string;
}

/**
 * 深复制一个页面的内容与当前正在使用的媒体，不复制访问/点击统计。
 * 文件先复制、数据库后事务写入；任一步失败都会清掉新页面的文件目录。
 */
export async function duplicateProfile(
  db: Db,
  sourceProfileId: string,
  input: DuplicateProfileInput,
) {
  const [source] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, sourceProfileId))
    .limit(1);
  if (!source) return null;

  const sourceButtons = await db
    .select()
    .from(buttons)
    .where(eq(buttons.profileId, sourceProfileId));
  const activeMediaIds = [
    source.avatarMediaId,
    source.avatarPosterId,
    source.bannerMediaId,
    source.backgroundMediaId,
  ].filter((id): id is string => Boolean(id));
  const uniqueMediaIds = [...new Set(activeMediaIds)];
  const sourceMedia = uniqueMediaIds.length
    ? await db.select().from(media).where(inArray(media.id, uniqueMediaIds))
    : [];

  const profileId = randomUUID();
  const mediaIdMap = new Map<string, string>();
  const copiedMedia = [] as Array<{
    id: string;
    profileId: string;
    kind: 'image' | 'video';
    width: number | null;
    height: number | null;
    durationMs: number | null;
    directory: string;
    variants: MediaVariant[];
  }>;

  try {
    for (const item of sourceMedia) {
      const nextMediaId = randomUUID();
      const nextDirectory = `${profileId}/${nextMediaId}`;
      await copyMediaDirectory(item.directory, nextDirectory);
      mediaIdMap.set(item.id, nextMediaId);

      const sourceDirectory = item.directory.replaceAll('\\', '/').replace(/\/$/, '');
      const variants = item.variants.map((variant) => {
        const normalized = variant.path.replaceAll('\\', '/');
        if (!normalized.startsWith(`${sourceDirectory}/`)) {
          throw new Error('invalid_media_variant_path');
        }
        return {
          ...variant,
          path: `${nextDirectory}/${normalized.slice(sourceDirectory.length + 1)}`,
        };
      });
      copiedMedia.push({
        id: nextMediaId,
        profileId,
        kind: item.kind,
        width: item.width,
        height: item.height,
        durationMs: item.durationMs,
        directory: nextDirectory,
        variants,
      });
    }

    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(profiles)
        .values({
          id: profileId,
          userId: source.userId,
          shortName: input.shortName,
          displayName: input.displayName,
          bio: source.bio,
          bioTypewriter: source.bioTypewriter,
          layout: source.layout,
          theme: source.theme,
          solidBackground: source.solidBackground,
          iconPlate: source.iconPlate,
          avatarMediaId: source.avatarMediaId ? mediaIdMap.get(source.avatarMediaId) : null,
          avatarPosterId: source.avatarPosterId ? mediaIdMap.get(source.avatarPosterId) : null,
          bannerMediaId: source.bannerMediaId ? mediaIdMap.get(source.bannerMediaId) : null,
          backgroundMediaId: source.backgroundMediaId
            ? mediaIdMap.get(source.backgroundMediaId)
            : null,
          backgroundOverlay: source.backgroundOverlay,
        })
        .returning({
          id: profiles.id,
          shortName: profiles.shortName,
          displayName: profiles.displayName,
          layout: profiles.layout,
          theme: profiles.theme,
          createdAt: profiles.createdAt,
        });

      if (copiedMedia.length) await tx.insert(media).values(copiedMedia);
      if (sourceButtons.length) {
        await tx.insert(buttons).values(
          sourceButtons.map((entry) => ({
            id: randomUUID(),
            profileId,
            kind: entry.kind,
            title: entry.title,
            subtitle: entry.subtitle,
            url: entry.url,
            platform: entry.platform,
            value: entry.value,
            directMessage: entry.directMessage,
            message: entry.message,
            position: entry.position,
            isLead: entry.isLead,
            passSource: entry.passSource,
          })),
        );
      }
      return created!;
    });

    return result;
  } catch (error) {
    await removeMediaDirectory(profileId);
    throw error;
  }
}
