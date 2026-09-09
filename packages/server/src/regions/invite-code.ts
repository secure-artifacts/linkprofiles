import { generateInviteCode, validateInviteCode } from '@link-profile/shared';
import { inviteCodes, regions } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type IssueResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'invalid'; message: string }
  | { ok: false; reason: 'taken' }
  /** 区域没了，或者在我们拿锁之前刚变成无归属 */
  | { ok: false; reason: 'unowned' };

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

    const outcome = await db
      .transaction(async (tx) => {
        // 先锁住区域行，同一区域的重置因此串行。不锁的话两条并发各自「作废
        // 自己看得见的旧码、插一条新的」，第二条的 UPDATE 看不到第一条刚插入
        // 的行，于是两条有效码同时存在，撞上 invite_codes_one_active_per_region
        // 这个部分唯一索引 —— 而它不是 code 那个索引，onConflict 兜不住，
        // 会一路上抛成 500。
        const [locked] = await tx
          .select({ ownerAdminId: regions.ownerAdminId })
          .from(regions)
          .where(eq(regions.id, regionId))
          .for('update');

        // 拿到锁才知道区域还在不在、还有没有人管。删管理员与发码并发时，
        // 这一步把「给一个刚变成无主的区域发码」挡在门外。
        if (!locked || locked.ownerAdminId === null) throw new RegionUnowned();

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
        if (err instanceof CodeTaken) return TAKEN;
        if (err instanceof RegionUnowned) return UNOWNED;
        throw err;
      });

    if (outcome === UNOWNED) return { ok: false, reason: 'unowned' };
    if (outcome !== TAKEN) return { ok: true, code: outcome };
    // 自定义的码撞了就直接告诉他换一个，随机的码再抽一次。
    if (code !== null) return { ok: false, reason: 'taken' };
  }

  return { ok: false, reason: 'taken' };
}

const TAKEN = Symbol('code-taken');
const UNOWNED = Symbol('region-unowned');

class CodeTaken extends Error {}
class RegionUnowned extends Error {}

/** 取区域当前有效的那一个码，没有返回 null。 */
export async function activeInviteCodeOf(db: Db, regionId: string): Promise<string | null> {
  const [row] = await db
    .select({ code: inviteCodes.code })
    .from(inviteCodes)
    .where(and(eq(inviteCodes.regionId, regionId), eq(inviteCodes.isActive, true)))
    .limit(1);
  return row?.code ?? null;
}
