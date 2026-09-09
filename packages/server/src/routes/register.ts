import { DEFAULT_LOCALE } from '@link-profile/i18n';
import {
  accountNameSchema,
  inviteCodeSchema,
  passwordSchema,
  shortNameSchema,
} from '@link-profile/shared';
import { inviteCodes, profiles, regions, users } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hashPassword } from '../auth/passwords.js';
import { fail } from '../http/errors.js';
import { readSettings } from '../settings/repository.js';
import { findUserConflict } from '../users/conflicts.js';

const previewQuery = z.object({
  code: inviteCodeSchema,
  /** 顺带问一句这个地址有没有被占。要先有一个有效码才问得了。 */
  shortName: z.string().optional(),
});

const registerBody = z.object({
  code: inviteCodeSchema,
  account: accountNameSchema,
  password: passwordSchema,
  shortName: shortNameSchema,
  displayName: z.string().trim().optional(),
});

/**
 * 自助注册。两个匿名接口，见 ADR-0018。
 *
 * 这是本系统唯一的匿名写入口。不做限流也不做名额上限是明知的取舍，止损手段
 * 只有全站注册总闸。
 */
export async function registerRoutes(app: FastifyInstance) {
  /** 关着的时候两个接口都拒，且不透露任何区域信息。 */
  async function registrationOpen(reply: FastifyReply): Promise<boolean> {
    const { registrationEnabled } = await readSettings(app.db);
    if (!registrationEnabled) {
      await fail(reply, 403, 'registration_closed');
      return false;
    }
    return true;
  }

  /**
   * 用邀请码换区域名，给注册页做「你将加入 XX」的确认。
   *
   * 无归属区域的码即便还在库里也当无效——没人管的区域不该继续进人。
   */
  app.get('/register/preview', async (req, reply) => {
    if (!(await registrationOpen(reply))) return reply;

    const parsed = previewQuery.safeParse(req.query);
    if (!parsed.success) return fail(reply, 400, 'invite_code_invalid');

    const region = await regionOfCode(app, parsed.data.code);
    if (!region) return fail(reply, 404, 'invite_code_invalid');

    if (parsed.data.shortName === undefined) return { regionName: region.name };

    const candidate = shortNameSchema.safeParse(parsed.data.shortName);
    if (!candidate.success) {
      return { regionName: region.name, shortName: { available: false, reason: 'invalid' } };
    }
    const conflict = await findUserConflict(app.db, { shortName: candidate.data });
    return {
      regionName: region.name,
      shortName: conflict
        ? { available: false, reason: conflict }
        : { available: true, reason: null },
    };
  });

  app.post('/register', async (req, reply) => {
    if (!(await registrationOpen(reply))) return reply;

    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }
    const { code, account, password, shortName, displayName } = parsed.data;

    const region = await regionOfCode(app, code);
    if (!region) return fail(reply, 400, 'invite_code_invalid');

    // 账号重复、short_name 重复、short_name 撞墓碑各自一个错误码，注册者
    // 才知道该改哪一个。
    const conflict = await findUserConflict(app.db, { account, shortName });
    if (conflict) return fail(reply, 409, conflict);

    const passwordHash = await hashPassword(password);

    try {
      // 账号与它的第一个个人页同一个事务，与管理员建号同一条规则。
      await app.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({
            role: 'user',
            account,
            passwordHash,
            label: displayName?.trim() || shortName,
            regionId: region.id,
            // 没有「创建者」可继承，就跟区域的归属管理员：他发的码，他带的人。
            uiLanguage: region.ownerUiLanguage,
          })
          .returning({ id: users.id });

        await tx.insert(profiles).values({
          userId: created!.id,
          shortName,
          displayName: displayName?.trim() || shortName,
          // 页面语言跟所有者的界面语言，与管理员建号同一条规则。
          pageLanguage: region.ownerUiLanguage,
        });
      });
    } catch (err) {
      // 只把并发抢注（唯一索引冲突）翻成冲突响应。其余的原样抛出去 ——
      // 把数据库故障也吞成「地址被占用」，用户会一直换名字，而真正的故障
      // 因为响应是 409 不会惊动任何人。
      const conflicted = uniqueViolationOf(err);
      if (!conflicted) throw err;
      return fail(reply, 409, conflicted);
    }

    // 不自动发会话：注册完回登录页自己登一次。
    return reply.code(201).send({ shortName });
  });
}

/**
 * 唯一索引冲突翻成对应的错误码，其余返回 null 表示「这不是冲突」。
 *
 * 冲突检查已经在事务前做过一遍，走到这里只可能是两个人同时注册撞在了一起。
 */
function uniqueViolationOf(err: unknown): 'account_taken' | 'short_name_taken' | null {
  // drizzle 把驱动的错误包一层再抛，真正带 SQLSTATE 的是 cause 链上的那个。
  for (let cur: unknown = err, depth = 0; cur && depth < 5; depth += 1) {
    const pg = cur as { code?: string; constraint_name?: string; cause?: unknown };
    if (pg.code === '23505') {
      return pg.constraint_name === 'users_account_unique' ? 'account_taken' : 'short_name_taken';
    }
    cur = pg.cause;
  }
  return null;
}

/** 码 → 区域。码要有效，区域还要有人管。 */
async function regionOfCode(app: FastifyInstance, code: string) {
  const owner = alias(users, 'region_owner');
  const [row] = await app.db
    .select({
      id: regions.id,
      name: regions.name,
      ownerAdminId: regions.ownerAdminId,
      ownerUiLanguage: owner.uiLanguage,
    })
    .from(inviteCodes)
    .innerJoin(regions, eq(regions.id, inviteCodes.regionId))
    .leftJoin(owner, eq(owner.id, regions.ownerAdminId))
    .where(and(eq(inviteCodes.code, code), eq(inviteCodes.isActive, true)))
    .limit(1);

  if (!row || row.ownerAdminId === null) return null;
  // 归属不为空就一定连得上那个管理员，兜底只是给类型收敛用。
  return { ...row, ownerUiLanguage: row.ownerUiLanguage ?? DEFAULT_LOCALE };
}
