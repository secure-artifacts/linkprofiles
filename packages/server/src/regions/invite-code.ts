import { generateInviteCode, validateInviteCode } from '@link-profile/shared';
import { inviteCodes } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type IssueResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'invalid'; message: string }
  | { ok: false; reason: 'taken' };

/**
 * 给区域发一个新的邀请码，并把它原来那个作废。
 *
 * 不是原地覆盖 —— 旧码留一行标记为失效，「这个人当初拿哪个码进来的」这段
 * 历史才还在。同一区域同时只有一个有效码由部分唯一索引保证。
 *
 * 不传 `custom` 就系统随机生成；随机撞车重试几次，管理员自定义的撞车直接
 * 报错，因为换一个是他自己的决定。
 */
export async function issueInviteCode(
  db: Db | Tx,
  regionId: string,
  custom?: string,
): Promise<IssueResult> {
  let code: string | null = null;
  if (custom !== undefined) {
    const parsed = validateInviteCode(custom);
    if (!parsed.ok) return { ok: false, reason: 'invalid', message: parsed.error };
    code = parsed.value;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = code ?? generateInviteCode();

    const inserted = await db
      .transaction(async (tx) => {
        await tx
          .update(inviteCodes)
          .set({ isActive: false, revokedAt: new Date() })
          .where(and(eq(inviteCodes.regionId, regionId), eq(inviteCodes.isActive, true)));

        const [row] = await tx
          .insert(inviteCodes)
          .values({ regionId, code: candidate, isActive: true })
          .onConflictDoNothing({ target: inviteCodes.code })
          .returning({ code: inviteCodes.code });
        // 撞车时整个事务回滚，旧码不会被白白作废。
        if (!row) throw new CodeTaken();
        return row.code;
      })
      .catch((err: unknown) => {
        if (err instanceof CodeTaken) return null;
        throw err;
      });

    if (inserted) return { ok: true, code: inserted };
    if (code !== null) return { ok: false, reason: 'taken' };
  }

  return { ok: false, reason: 'taken' };
}

class CodeTaken extends Error {}

/** 取区域当前有效的那一个码，没有返回 null。 */
export async function activeInviteCodeOf(db: Db, regionId: string): Promise<string | null> {
  const [row] = await db
    .select({ code: inviteCodes.code })
    .from(inviteCodes)
    .where(and(eq(inviteCodes.regionId, regionId), eq(inviteCodes.isActive, true)))
    .limit(1);
  return row?.code ?? null;
}
