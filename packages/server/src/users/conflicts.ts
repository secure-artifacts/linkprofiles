import { profiles, users } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { isRetired } from '../profiles/deletion.js';

/**
 * 「这个账号 / short_name 能不能用」的唯一判定。
 *
 * 单个创建、改名与批量创建都走这里。之前这套检查在两个路由里各写了一份，
 * 结果 16 加墓碑检查时只改到其中一份，批量创建因此能抢注一个已退休的
 * short_name —— 单个创建拒绝、绕道批量就能进。合成一处就漏不掉了。
 *
 * 账号与 short_name 拆开之后两者查的是不同的表，排除自己时用的也是
 * 不同的主键：账号排除的是 `users.id`，short_name 排除的是 `profiles.id`。
 * 两个 id 不可混用，因此分成两个参数，见 ADR-0008。
 */
export type UserConflict = 'account_taken' | 'short_name_taken' | 'short_name_retired';

export interface ConflictQuery {
  /** 不传表示这次不动账号（例如只改个人页地址） */
  account?: string | null;
  /** 不传表示这次不动地址（例如只改账号备注） */
  shortName?: string | null;
  /** 改自己的账号时排除自己 */
  excludeUserId?: string;
  /** 改自己的个人页地址时排除自己 */
  excludeProfileId?: string;
}

export async function findUserConflict(
  db: Db,
  { account, shortName, excludeUserId, excludeProfileId }: ConflictQuery,
): Promise<UserConflict | null> {
  if (account) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.account, account))
      .limit(1);
    if (row && row.id !== excludeUserId) return 'account_taken';
  }

  if (shortName) {
    const [row] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.shortName, shortName))
      .limit(1);
    if (row && row.id !== excludeProfileId) return 'short_name_taken';

    // 墓碑里的地址永不释放，新建与改名都抢不到
    if (await isRetired(db, shortName)) return 'short_name_retired';
  }

  return null;
}

/** 批量导入按行报错，要的是一句带上具体值的人话，而不是错误码。 */
export function describeConflict(
  conflict: UserConflict,
  input: { account: string; shortName: string },
): string {
  switch (conflict) {
    case 'account_taken':
      return `账号 ${input.account} 已存在`;
    case 'short_name_taken':
      return `short_name ${input.shortName} 已被占用`;
    case 'short_name_retired':
      return `short_name ${input.shortName} 属于一个已删除的个人页，永不再分配`;
  }
}
