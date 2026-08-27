import {
  isSocialPlatformId,
  MAX_BUTTONS_PER_USER,
  SOCIAL_PLATFORMS,
  validateTargetUrl,
} from '@link-profile/shared';
import { buttons, layoutEnum, socialIcons, themeEnum, users } from '@link-profile/shared/schema';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FORBIDDEN, loadTargetUser, UNAUTHORIZED } from '../auth/guards.js';
import type { CurrentUser } from '../auth/sessions.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const profileBody = z.object({
  displayName: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(300).optional(),
  /** 布局只决定头像与头图区域的形状和占比，不决定配色 */
  layout: z.enum(layoutEnum.enumValues).optional(),
  theme: z.enum(themeEnum.enumValues).optional(),
  /** 背景图上那层遮罩的暗度。加深对浅色文字主题有利、对深色文字主题不利。 */
  backgroundOverlay: z.number().min(0).max(1).optional(),
});

const buttonInput = z.object({
  title: z.string().trim().min(1, '按钮文字不能为空').max(80),
  /** 选填的一行说明，留空则页面上不渲染 */
  subtitle: z.string().trim().max(80).default(''),
  url: z.string(),
  isLead: z.boolean().default(false),
  passSource: z.boolean().default(false),
});

/**
 * 整份有序列表一次提交。
 *
 * 增、删、改、拖拽排序在编辑器里都是对同一个数组的操作，一次存下来
 * 比拆成若干个接口 + 一个单独的重排接口简单，也不会有排序竞态。
 * 顺序即数组下标。
 */
const buttonsBody = z.object({
  buttons: z
    .array(buttonInput)
    .max(MAX_BUTTONS_PER_USER, `单页按钮数量上限 ${MAX_BUTTONS_PER_USER}`),
});

const socialIconInput = z.object({
  platform: z.string(),
  /** 用户填的号码 / 邮箱 / 用户名，不是拼好的 URL */
  value: z.string().trim().min(1, '内容不能为空'),
  isLead: z.boolean().optional(),
  passSource: z.boolean().default(false),
});

const socialIconsBody = z.object({
  socialIcons: z.array(socialIconInput).max(SOCIAL_PLATFORMS.length),
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

  app.get<{ Params: { id: string } }>('/users/:id/profile', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);

    const target = await resolveTarget(app, req.currentUser, req.params.id, 'read');
    if (!target) return reply.code(403).send(FORBIDDEN);

    return loadEditableProfile(app, target);
  });

  app.patch<{ Params: { id: string } }>('/users/:id/profile', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const target = await resolveTarget(app, req.currentUser, req.params.id, 'update');
    if (!target) return reply.code(403).send(FORBIDDEN);

    await app.db
      .update(users)
      .set({
        ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio } : {}),
        ...(parsed.data.layout !== undefined ? { layout: parsed.data.layout } : {}),
        ...(parsed.data.theme !== undefined ? { theme: parsed.data.theme } : {}),
        ...(parsed.data.backgroundOverlay !== undefined
          ? { backgroundOverlay: parsed.data.backgroundOverlay.toFixed(2) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, target));

    return loadEditableProfile(app, target);
  });

  app.put<{ Params: { id: string } }>('/users/:id/buttons', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    const parsed = buttonsBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const target = await resolveTarget(app, req.currentUser, req.params.id, 'update');
    if (!target) return reply.code(403).send(FORBIDDEN);

    // 目标地址逐条校验，带上下标好让后台指出是哪一条
    const rows: (typeof buttons.$inferInsert)[] = [];
    for (const [index, input] of parsed.data.buttons.entries()) {
      const url = validateTargetUrl(input.url);
      if (!url.ok) {
        return reply.code(400).send({ error: 'invalid_url', index, message: url.error });
      }
      rows.push({
        userId: target,
        title: input.title,
        subtitle: input.subtitle,
        url: url.value,
        position: index,
        isLead: input.isLead,
        passSource: input.passSource,
      });
    }

    await app.db.transaction(async (tx) => {
      await tx.delete(buttons).where(eq(buttons.userId, target));
      if (rows.length) await tx.insert(buttons).values(rows);
    });

    return loadEditableProfile(app, target);
  });

  app.put<{ Params: { id: string } }>('/users/:id/social-icons', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    const parsed = socialIconsBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const target = await resolveTarget(app, req.currentUser, req.params.id, 'update');
    if (!target) return reply.code(403).send(FORBIDDEN);

    const seen = new Set<string>();
    const rows: (typeof socialIcons.$inferInsert)[] = [];
    for (const [index, input] of parsed.data.socialIcons.entries()) {
      // 清单仅含海外平台，不认识的 id 一律拒绝，挡住绕过后台直接调接口。
      if (!isSocialPlatformId(input.platform)) {
        return reply.code(400).send({ error: 'unknown_platform', index, platform: input.platform });
      }
      if (seen.has(input.platform)) {
        return reply
          .code(400)
          .send({ error: 'duplicate_platform', index, platform: input.platform });
      }
      seen.add(input.platform);

      const platform = SOCIAL_PLATFORMS.find((p) => p.id === input.platform)!;
      rows.push({
        userId: target,
        platform: input.platform,
        value: input.value,
        position: index,
        isLead: input.isLead ?? platform.defaultIsLead,
        passSource: input.passSource,
      });
    }

    await app.db.transaction(async (tx) => {
      await tx.delete(socialIcons).where(eq(socialIcons.userId, target));
      if (rows.length) await tx.insert(socialIcons).values(rows);
    });

    return loadEditableProfile(app, target);
  });
}

/**
 * 统一的目标解析：id 不合法、越权、不存在、不是 user 角色，
 * 对外都收敛成同一个 null，调用方一律回 403。
 */
async function resolveTarget(
  app: FastifyInstance,
  actor: CurrentUser,
  id: string,
  action: 'read' | 'update',
): Promise<string | null> {
  if (!UUID.test(id)) return null;
  const target = await loadTargetUser(app.db, actor, id, action);
  return target && target.role === 'user' ? target.id : null;
}

/** 编辑器与预览都读这一份，字段与保存接口一一对应。 */
async function loadEditableProfile(app: FastifyInstance, userId: string) {
  const [profile] = await app.db
    .select({
      id: users.id,
      shortName: users.shortName,
      displayName: users.displayName,
      bio: users.bio,
      layout: users.layout,
      theme: users.theme,
      backgroundOverlay: users.backgroundOverlay,
      avatarMediaId: users.avatarMediaId,
      backgroundMediaId: users.backgroundMediaId,
    })
    .from(users)
    .where(eq(users.id, userId));

  const buttonRows = await app.db
    .select({
      id: buttons.id,
      title: buttons.title,
      subtitle: buttons.subtitle,
      url: buttons.url,
      isLead: buttons.isLead,
      passSource: buttons.passSource,
      position: buttons.position,
    })
    .from(buttons)
    .where(eq(buttons.userId, userId))
    .orderBy(asc(buttons.position));

  const iconRows = await app.db
    .select({
      id: socialIcons.id,
      platform: socialIcons.platform,
      value: socialIcons.value,
      isLead: socialIcons.isLead,
      passSource: socialIcons.passSource,
      position: socialIcons.position,
    })
    .from(socialIcons)
    .where(eq(socialIcons.userId, userId))
    .orderBy(asc(socialIcons.position));

  return { profile, buttons: buttonRows, socialIcons: iconRows };
}
