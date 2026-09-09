import type { ErrorKey } from '@link-profile/i18n';
import {
  buildSocialTargetUrl,
  findSocialPlatform,
  isSocialPlatformId,
  validateSocialValue,
  type SocialPlatformId,
} from '@link-profile/shared';
import { buttons } from '@link-profile/shared/schema';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';

export interface ContactPatch {
  value?: string;
  title?: string;
  subtitle?: string;
  message?: string;
  directMessage?: boolean;
  isLead?: boolean;
  passSource?: boolean;
}

/**
 * 外部调用方拿到的是错误码加一个 key；文案在响应出口按固定英语渲染，
 * 见 ADR-0021。这里不拼人话，也就不会把某一种语言焊进业务逻辑。
 */
export class ContactUpdateError extends Error {
  constructor(
    readonly code: 'unknown_platform' | 'contact_not_found' | 'invalid_contact_value',
    readonly platform: string,
    readonly messageKey: ErrorKey,
  ) {
    super(messageKey);
  }
}

export async function listContactParameters(db: Db, profileId: string) {
  const rows = await db
    .select()
    .from(buttons)
    .where(eq(buttons.profileId, profileId))
    .orderBy(asc(buttons.position));
  return rows
    .filter((entry) => entry.kind === 'social' && entry.platform && entry.value)
    .map((entry) => ({
      platform: entry.platform!,
      value: entry.value!,
      title: entry.title,
      subtitle: entry.subtitle,
      message: entry.message,
      directMessage: entry.directMessage,
      isLead: entry.isLead,
      passSource: entry.passSource,
      targetUrl: buildSocialTargetUrl(
        entry.platform!,
        entry.value!,
        entry.directMessage,
        entry.message,
      ),
    }));
}

/**
 * 联系方式局部更新的深模块：校验、保留按钮 id、创建缺失项、排序与事务都藏在这里。
 * 后台和外部入口以后都可以复用同一个 seam。
 */
export async function updateContactParameters(
  db: Db,
  profileId: string,
  patches: Record<string, ContactPatch>,
  createMissing: boolean,
) {
  const existing = await db
    .select()
    .from(buttons)
    .where(eq(buttons.profileId, profileId))
    .orderBy(asc(buttons.position));
  const socialByPlatform = new Map(
    existing.filter((entry) => entry.kind === 'social').map((entry) => [entry.platform!, entry]),
  );
  let nextPosition = existing.length;
  const operations: Array<typeof buttons.$inferInsert> = [];

  for (const [platformId, patch] of Object.entries(patches)) {
    if (!isSocialPlatformId(platformId)) {
      throw new ContactUpdateError('unknown_platform', platformId, 'contact.unknownPlatform');
    }
    const current = socialByPlatform.get(platformId);
    if (!current && !createMissing) {
      throw new ContactUpdateError('contact_not_found', platformId, 'contact.notOnPage');
    }
    const platform = findSocialPlatform(platformId)!;
    const value = (patch.value ?? current?.value ?? '').trim();
    const validation = validateSocialValue(platformId, value);
    if (!validation.ok) {
      throw new ContactUpdateError('invalid_contact_value', platformId, 'contact.invalidValue');
    }

    operations.push({
      ...(current ? { id: current.id } : {}),
      profileId,
      kind: 'social',
      title: patch.title?.trim() || current?.title || platform.label,
      subtitle: patch.subtitle?.trim() ?? current?.subtitle ?? '',
      url: null,
      platform: platformId,
      value,
      directMessage:
        platformId === 'instagram'
          ? (patch.directMessage ?? current?.directMessage ?? true)
          : false,
      message: ['whatsapp', 'sms'].includes(platformId)
        ? (patch.message?.trim() ?? current?.message ?? '')
        : '',
      position: current?.position ?? nextPosition++,
      isLead: patch.isLead ?? current?.isLead ?? platform.defaultIsLead,
      passSource: patch.passSource ?? current?.passSource ?? false,
    });
  }

  await db.transaction(async (tx) => {
    for (const operation of operations) {
      const { id, ...values } = operation;
      if (id) {
        await tx
          .update(buttons)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(buttons.id, id));
      } else {
        await tx.insert(buttons).values(values);
      }
    }
  });

  return operations.map((entry) => ({
    platform: entry.platform as SocialPlatformId,
    value: entry.value!,
    title: entry.title,
    subtitle: entry.subtitle,
    message: entry.message,
    directMessage: entry.directMessage,
    isLead: entry.isLead,
    passSource: entry.passSource,
    targetUrl: buildSocialTargetUrl(
      entry.platform!,
      entry.value!,
      entry.directMessage,
      entry.message,
    ),
  }));
}
