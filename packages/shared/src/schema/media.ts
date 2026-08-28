import { relations } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './profiles.js';

export const mediaKindEnum = pgEnum('media_kind', ['image', 'video']);

/** 一张图转出的多个格式。AVIF 为主、WebP 兜底，外加一张缩略图。 */
export interface MediaVariant {
  format: 'avif' | 'webp' | 'mp4';
  mimeType: string;
  path: string;
  width: number | null;
  height: number | null;
  bytes: number;
  /** 缩略图不参与首屏，只在后台列表里用 */
  thumbnail?: boolean;
}

export const media = pgTable(
  'media',
  {
    id: uuid().primaryKey().defaultRandom(),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    kind: mediaKindEnum().notNull(),
    width: integer(),
    height: integer(),
    /** 仅视频有值。视频不转码，时长是从 mp4 的 mvhd 盒里读出来的。 */
    durationMs: integer(),

    /** 落盘的相对目录，删个人页时按它清理，见 16。 */
    directory: text().notNull(),
    variants: jsonb().$type<MediaVariant[]>().notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('media_profile_idx').on(t.profileId)],
);

export const mediaRelations = relations(media, ({ one }) => ({
  profile: one(profiles, { fields: [media.profileId], references: [profiles.id] }),
}));

export type MediaRow = typeof media.$inferSelect;
