import {
  isSocialPlatformId,
  MAX_BUTTONS_PER_PROFILE,
  shortNameSchema,
  SOCIAL_PLATFORMS,
  validateSocialValue,
  validateTargetUrl,
} from '@link-profile/shared';
import {
  buttons,
  layoutEnum,
  profiles,
  shortNameChanges,
  themeEnum,
  users,
} from '@link-profile/shared/schema';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FORBIDDEN, loadTargetUser, UNAUTHORIZED } from '../auth/guards.js';
import { deleteProfile } from '../profiles/deletion.js';
import { duplicateProfile } from '../profiles/duplicate.js';
import {
  loadMediaByIds,
  toMediaSource,
  toThumbnailUrl,
  toVideoSource,
} from '../profiles/media-view.js';
import { findUserConflict } from '../users/conflicts.js';
import { resolveProfileAccess } from '../profiles/access.js';
import { findProfileById } from '../profiles/repository.js';
import { renderProfileDocument } from '../render/document.js';
import { publicOrigin } from '../render/origin.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 改名人。与被改的那个页面的主人不是一回事，所以要单独 join 一次。 */
const changedBy = alias(users, 'changed_by');

const createProfileBody = z.object({
  shortName: shortNameSchema,
  /** 显示名：个人页上给访客看的名字，可重复。留空时先跟 short_name 一致 */
  displayName: z.string().trim().max(60).optional(),
});

const duplicateProfileBody = z.object({
  shortName: shortNameSchema,
  displayName: z.string().trim().min(1, '显示名不能为空').max(60),
});

const profileBody = z.object({
  displayName: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(300).optional(),
  bioTypewriter: z.boolean().optional(),
  /** 布局只决定头像与头图区域的形状和占比，不决定配色 */
  layout: z.enum(layoutEnum.enumValues).optional(),
  theme: z.enum(themeEnum.enumValues).optional(),
  /** 条目一律实心卡片还是一律描边行。整页统一，不逐条配。 */
  solidBackground: z.boolean().optional(),
  iconPlate: z.boolean().optional(),
  /** 背景图上那层遮罩的暗度。加深对浅色文字主题有利、对深色文字主题不利。 */
  backgroundOverlay: z.number().min(0).max(1).optional(),
});

/**
 * 一个条目。两种 kind 要求的字段不同，用 discriminatedUnion 分开，
 * 免得两边的必填项互相污染（比如 social 不该被要求填 url）。
 *
 * **id 必须保留下来**：点击埋点记的是 `clicks.target_id`，换一次 id
 * 这个条目的历史点击就全成了孤儿，单条目点击率归零。而编辑器里任何
 * 一次保存（哪怕只是改了主题）都会把整份列表提交一遍。
 */
const entryInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('link'),
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1, '标题不能为空').max(80),
    /** 选填的一行说明，留空则页面上不渲染 */
    subtitle: z.string().trim().max(80).default(''),
    url: z.string(),
    isLead: z.boolean().default(false),
    passSource: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('social'),
    id: z.string().uuid().optional(),
    /** 社媒条目现在也有用户自定义的标题与描述，不再只是一枚图标 */
    title: z.string().trim().min(1, '标题不能为空').max(80),
    subtitle: z.string().trim().max(80).default(''),
    platform: z.string(),
    /** 用户填的号码 / 邮箱 / 用户名，不是拼好的 URL */
    value: z.string().trim().min(1, '内容不能为空'),
    directMessage: z.boolean().default(false),
    message: z.string().trim().max(500).default(''),
    isLead: z.boolean().optional(),
    passSource: z.boolean().default(false),
  }),
]);

/**
 * 整份有序列表一次提交。
 *
 * 增、删、改、拖拽排序在编辑器里都是对同一个数组的操作，一次存下来
 * 比拆成若干个接口 + 一个单独的重排接口简单，也不会有排序竞态。
 * 顺序即数组下标。
 *
 * 但**不是整表删了重插**：带 id 的原地更新、不带 id 的新建、没出现在
 * 这次提交里的才删除。见 `entryInput` 的说明。
 *
 * 总长度上限是两种 kind 各自上限之和 —— 合表之前链接与社媒各有各的额度，
 * 合表不该把这两份额度挤成一份。逐类的检查在处理函数里。
 */
const entriesBody = z.object({
  entries: z.array(entryInput).max(MAX_BUTTONS_PER_PROFILE + SOCIAL_PLATFORMS.length),
});

export async function profileContentRoutes(app: FastifyInstance) {
  /** 内置平台清单，供后台渲染逐个启用的开关与输入提示。 */
  app.get('/social-platforms', async () => ({
    platforms: SOCIAL_PLATFORMS.map((p) => ({
      id: p.id,
      label: p.label,
      brandHex: p.brandHex,
      inputKind: p.inputKind,
      inputHint: p.inputHint,
      defaultIsLead: p.defaultIsLead,
    })),
  }));

  /** 某个账号名下的全部个人页。一个账号可以有多个，见 ADR-0008。 */
  app.get<{ Params: { userId: string } }>('/users/:userId/profiles', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    if (!UUID.test(req.params.userId)) return reply.code(403).send(FORBIDDEN);

    const owner = await loadTargetUser(app.db, req.currentUser, req.params.userId, 'read');
    if (!owner || owner.role !== 'user') return reply.code(403).send(FORBIDDEN);

    const rows = await app.db
      .select({
        id: profiles.id,
        shortName: profiles.shortName,
        displayName: profiles.displayName,
        layout: profiles.layout,
        theme: profiles.theme,
        avatarMediaId: profiles.avatarMediaId,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(eq(profiles.userId, owner.id))
      .orderBy(asc(profiles.createdAt));

    // 一次把这批页面的头像全查出来，不要逐行查
    const mediaById = await loadMediaByIds(
      app.db,
      rows.map((r) => r.avatarMediaId),
    );

    return {
      profiles: rows.map(({ avatarMediaId, ...rest }) => ({
        ...rest,
        avatarUrl: toThumbnailUrl(avatarMediaId ? mediaById.get(avatarMediaId) : undefined),
      })),
    };
  });

  /** 给某个账号新建一个个人页。不限数量。 */
  app.post<{ Params: { userId: string } }>('/users/:userId/profiles', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    if (!UUID.test(req.params.userId)) return reply.code(403).send(FORBIDDEN);

    const parsed = createProfileBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    // 建页面不作废任何已发出去的链接，只是多一个地址，所以用户自己也能建
    const owner = await loadTargetUser(
      app.db,
      req.currentUser,
      req.params.userId,
      'profile:create',
    );
    if (!owner || owner.role !== 'user') return reply.code(403).send(FORBIDDEN);

    const conflict = await findUserConflict(app.db, { shortName: parsed.data.shortName });
    if (conflict) return reply.code(409).send({ error: conflict });

    const [row] = await app.db
      .insert(profiles)
      .values({
        userId: owner.id,
        shortName: parsed.data.shortName,
        displayName: parsed.data.displayName || parsed.data.shortName,
      })
      .returning({
        id: profiles.id,
        shortName: profiles.shortName,
        displayName: profiles.displayName,
        layout: profiles.layout,
        theme: profiles.theme,
        createdAt: profiles.createdAt,
      });

    return reply.code(201).send(row);
  });

  app.get<{ Params: { id: string } }>('/profiles/:id', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);

    const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'read');
    if (!target) return reply.code(403).send(FORBIDDEN);

    return loadEditableProfile(app, target);
  });

  /**
   * 后台卡片使用的静态缩略预览。它与公开页共用渲染组件，但不执行跳转/埋点脚本，
   * 也不会调用 recordPageView，因此打开页面列表不会污染访问数据。
   */
  app.get<{ Params: { id: string } }>('/profiles/:id/preview', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'read');
    if (!target) return reply.code(403).send(FORBIDDEN);

    const profile = await findProfileById(app.db, target);
    if (!profile) return reply.code(404).send({ error: 'profile_not_found' });
    const origin = publicOrigin(req);
    const previewImage =
      (profile.view.layout === 'banner' ? profile.view.banner?.src : null) ??
      profile.view.video?.poster ??
      profile.view.avatar?.src ??
      `/_static/og/${profile.view.theme}.png`;
    // 列表可能同时出现很多页面：缩略图只画视频封面，不自动播放多段视频；
    // 打字动画也改成静态全文，避免每次滚动卡片时重新闪动。
    const previewView = {
      ...profile.view,
      bioTypewriter: false,
      avatar: profile.view.video?.poster ? { src: profile.view.video.poster } : profile.view.avatar,
      video: null,
    };

    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'private, no-store')
      .send(
        renderProfileDocument({
          profile: previewView,
          canonicalUrl: `${origin}/${profile.shortName}`,
          previewImageUrl: previewImage.startsWith('http')
            ? previewImage
            : `${origin}${previewImage}`,
          interactive: false,
        }),
      );
  });

  /** 复制内容、样式、按钮与媒体；访问和点击数据按新页面从零开始。 */
  app.post<{ Params: { id: string } }>('/profiles/:id/duplicate', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    const parsed = duplicateProfileBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'update');
    if (!target) return reply.code(403).send(FORBIDDEN);
    const conflict = await findUserConflict(app.db, { shortName: parsed.data.shortName });
    if (conflict) return reply.code(409).send({ error: conflict });

    const created = await duplicateProfile(app.db, target, parsed.data);
    if (!created) return reply.code(404).send({ error: 'profile_not_found' });
    return reply.code(201).send(created);
  });

  /**
   * 改个人页地址。与内容编辑分开，因为它的后果外溢到系统之外：已经印在名片、
   * 二维码、投放素材上的旧地址会立刻失效。每次改动留一条流水，改错了照着改回去。
   */
  app.patch<{ Params: { id: string } }>('/profiles/:id/short-name', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);

    const parsed = z.object({ shortName: shortNameSchema }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const target = await resolveProfileAccess(
      app.db,
      req.currentUser,
      req.params.id,
      'update:shortName',
    );
    if (!target) return reply.code(403).send(FORBIDDEN);

    const [current] = await app.db
      .select({ shortName: profiles.shortName })
      .from(profiles)
      .where(eq(profiles.id, target));
    if (!current) return reply.code(403).send(FORBIDDEN);

    // 改成原来那个不算一次改动，不留流水
    if (current.shortName === parsed.data.shortName) return loadEditableProfile(app, target);

    const conflict = await findUserConflict(app.db, {
      shortName: parsed.data.shortName,
      excludeProfileId: target,
    });
    if (conflict) return reply.code(409).send({ error: conflict });

    const actorId = req.currentUser.id;
    // 改名与流水同一个事务：只写成一半的话，回退时就照不着旧地址了
    await app.db.transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({ shortName: parsed.data.shortName, updatedAt: new Date() })
        .where(eq(profiles.id, target));

      await tx.insert(shortNameChanges).values({
        profileId: target,
        fromShortName: current.shortName,
        toShortName: parsed.data.shortName,
        changedBy: actorId,
      });
    });

    return loadEditableProfile(app, target);
  });

  /**
   * 这个页面的地址改过几次、从什么改成什么。
   *
   * 拿它做回退：挑一个旧地址，走上面那个 PATCH 改回去即可 —— 冲突与墓碑检查
   * 在那条路径上已经做了，这里不需要第二个入口。
   */
  app.get<{ Params: { id: string } }>('/profiles/:id/short-name-history', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);

    const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'read');
    if (!target) return reply.code(403).send(FORBIDDEN);

    const rows = await app.db
      .select({
        id: shortNameChanges.id,
        fromShortName: shortNameChanges.fromShortName,
        toShortName: shortNameChanges.toShortName,
        createdAt: shortNameChanges.createdAt,
        changedByLabel: sql<
          string | null
        >`coalesce(nullif(${changedBy.label}, ''), ${changedBy.account})`,
      })
      .from(shortNameChanges)
      .leftJoin(changedBy, eq(changedBy.id, shortNameChanges.changedBy))
      .where(eq(shortNameChanges.profileId, target))
      .orderBy(desc(shortNameChanges.createdAt));

    return { changes: rows };
  });

  /** 删一个个人页。它的 short_name 进墓碑，永不再分配。 */
  app.delete<{ Params: { id: string } }>('/profiles/:id', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    // 删页面是唯一不可逆的那个：地址进墓碑永不再分配，媒体一并从磁盘删除。
    // 与建页面分开管，用户建得了但删不了。
    const target = await resolveProfileAccess(
      app.db,
      req.currentUser,
      req.params.id,
      'profile:delete',
    );
    if (!target) return reply.code(403).send(FORBIDDEN);

    await deleteProfile(app.db, target);
    return reply.code(204).send();
  });

  app.patch<{ Params: { id: string } }>('/profiles/:id', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'update');
    if (!target) return reply.code(403).send(FORBIDDEN);

    await app.db
      .update(profiles)
      .set({
        ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio } : {}),
        ...(parsed.data.bioTypewriter !== undefined
          ? { bioTypewriter: parsed.data.bioTypewriter }
          : {}),
        ...(parsed.data.layout !== undefined ? { layout: parsed.data.layout } : {}),
        ...(parsed.data.theme !== undefined ? { theme: parsed.data.theme } : {}),
        ...(parsed.data.solidBackground !== undefined
          ? { solidBackground: parsed.data.solidBackground }
          : {}),
        ...(parsed.data.iconPlate !== undefined ? { iconPlate: parsed.data.iconPlate } : {}),
        ...(parsed.data.backgroundOverlay !== undefined
          ? { backgroundOverlay: parsed.data.backgroundOverlay.toFixed(2) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, target));

    return loadEditableProfile(app, target);
  });

  /**
   * 整份条目列表一次提交。链接与社媒混在同一个数组里，靠 `kind` 区分。
   *
   * 两种 kind 各有各的数量额度：链接受 `MAX_BUTTONS_PER_PROFILE` 限制，
   * 社媒受内置清单长度限制且同一平台只能启用一次。合表不该把这两份额度
   * 挤成一份 —— 那会让原本能建 50 个链接的页面因为加了社媒而建不满。
   */
  app.put<{ Params: { id: string } }>('/profiles/:id/entries', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    const parsed = entriesBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'update');
    if (!target) return reply.code(403).send(FORBIDDEN);

    const links = parsed.data.entries.filter((e) => e.kind === 'link');
    if (links.length > MAX_BUTTONS_PER_PROFILE) {
      return reply.code(400).send({
        error: 'too_many_buttons',
        message: `单页自定义链接数量上限 ${MAX_BUTTONS_PER_PROFILE}`,
      });
    }

    const rows: (typeof buttons.$inferInsert)[] = [];
    const seenPlatforms = new Set<string>();

    // 逐条校验，带上下标好让后台指出是哪一条
    for (const [index, input] of parsed.data.entries.entries()) {
      const common = {
        ...(input.id ? { id: input.id } : {}),
        profileId: target,
        title: input.title,
        subtitle: input.subtitle,
        position: index,
        passSource: input.passSource,
      };

      if (input.kind === 'link') {
        const url = validateTargetUrl(input.url);
        if (!url.ok) {
          return reply.code(400).send({ error: 'invalid_url', index, message: url.error });
        }
        const isLead = input.isLead;
        rows.push({
          ...common,
          kind: 'link',
          url: url.value,
          platform: null,
          value: null,
          isLead,
        });
        continue;
      }

      if (!isSocialPlatformId(input.platform)) {
        return reply.code(400).send({ error: 'unknown_platform', index, platform: input.platform });
      }
      if (seenPlatforms.has(input.platform)) {
        return reply
          .code(400)
          .send({ error: 'duplicate_platform', index, platform: input.platform });
      }
      seenPlatforms.add(input.platform);

      const socialValue = validateSocialValue(input.platform, input.value);
      if (!socialValue.ok) {
        return reply.code(400).send({
          error: 'invalid_social_value',
          index,
          message: socialValue.error,
        });
      }

      const platform = SOCIAL_PLATFORMS.find((p) => p.id === input.platform)!;
      const isLead = input.isLead ?? platform.defaultIsLead;
      rows.push({
        ...common,
        kind: 'social',
        url: null,
        platform: input.platform,
        value: input.value,
        directMessage: input.platform === 'instagram' ? input.directMessage : false,
        message: ['whatsapp', 'sms'].includes(input.platform) ? input.message : '',
        isLead,
      });
    }

    await app.db.transaction(async (tx) => {
      const owned = new Set(
        (
          await tx.select({ id: buttons.id }).from(buttons).where(eq(buttons.profileId, target))
        ).map((r) => r.id),
      );

      // 别人的 id 塞进来只会当作新建，劫持不了不属于自己的行
      const keep = rows.filter((row) => row.id && owned.has(row.id)).map((row) => row.id!);
      const stale = [...owned].filter((id) => !keep.includes(id));
      if (stale.length) await tx.delete(buttons).where(inArray(buttons.id, stale));

      for (const row of rows) {
        const { id, ...values } = row;
        if (id && owned.has(id)) {
          await tx
            .update(buttons)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(buttons.id, id));
        } else {
          await tx.insert(buttons).values(values);
        }
      }
    });

    return loadEditableProfile(app, target);
  });
}

/** 编辑器与预览都读这一份，字段与保存接口一一对应。 */
async function loadEditableProfile(app: FastifyInstance, profileId: string) {
  const [profile] = await app.db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      shortName: profiles.shortName,
      displayName: profiles.displayName,
      bio: profiles.bio,
      bioTypewriter: profiles.bioTypewriter,
      layout: profiles.layout,
      theme: profiles.theme,
      solidBackground: profiles.solidBackground,
      iconPlate: profiles.iconPlate,
      backgroundOverlay: profiles.backgroundOverlay,
      avatarMediaId: profiles.avatarMediaId,
      bannerMediaId: profiles.bannerMediaId,
      backgroundMediaId: profiles.backgroundMediaId,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId));

  const entryRows = await app.db
    .select({
      id: buttons.id,
      kind: buttons.kind,
      title: buttons.title,
      subtitle: buttons.subtitle,
      url: buttons.url,
      platform: buttons.platform,
      value: buttons.value,
      directMessage: buttons.directMessage,
      message: buttons.message,
      isLead: buttons.isLead,
      passSource: buttons.passSource,
      position: buttons.position,
    })
    .from(buttons)
    .where(eq(buttons.profileId, profileId))
    .orderBy(asc(buttons.position));

  const mediaById = await loadMediaByIds(app.db, [
    profile?.avatarMediaId ?? null,
    profile?.bannerMediaId ?? null,
    profile?.backgroundMediaId ?? null,
  ]);
  const avatarRow = profile?.avatarMediaId ? mediaById.get(profile.avatarMediaId) : undefined;
  const bannerRow = profile?.bannerMediaId ? mediaById.get(profile.bannerMediaId) : undefined;
  const backgroundRow = profile?.backgroundMediaId
    ? mediaById.get(profile.backgroundMediaId)
    : undefined;
  const video = toVideoSource(avatarRow, undefined);

  return {
    profile: profile
      ? {
          ...profile,
          // 编辑器要的是可直接放进 <img> 的地址，不是 mediaId
          avatarUrl: video?.src ?? toMediaSource(avatarRow)?.src ?? null,
          avatarIsVideo: video !== null,
          bannerUrl: toMediaSource(bannerRow)?.src ?? null,
          backgroundUrl: toMediaSource(backgroundRow)?.src ?? null,
        }
      : profile,
    entries: entryRows,
  };
}
