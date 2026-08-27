import { users } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { isRetired } from '../profiles/deletion.js';

/**
 * 「这个账号 / short_name 能不能用」的唯一判定。
 *
 * 单个创建、改名与批量创建都走这里。之前这套检查在两个路由里各写了一份，
 * 结果 16 加墓碑检查时只改到其中一份，批量创建因此能抢注一个已退休的
 * short_name —— 单个创建拒绝、绕道批量就能进。合成一处就漏不掉了。
 */
export type UserConflict = 'account_taken' | 'short_name_taken' | 'short_name_retired';

export interface ConflictQuery {
  /** 不传表示这次不动账号（例如改名） */
  account?: string | null;
  shortName: string;
  /** 改自己时把自己排除掉 */
  excludeId?: string;
}

export async function findUserConflict(
  db: Db,
  { account, shortName, excludeId }: ConflictQuery,
): Promise<UserConflict | null> {
  if (account) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.account, account))
      .limit(1);
    if (row && row.id !== excludeId) return 'account_taken';
  }

  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.shortName, shortName))
    .limit(1);
  if (row && row.id !== excludeId) return 'short_name_taken';

  // 墓碑里的地址永不释放，新建与改名都抢不到
  if (await isRetired(db, shortName)) return 'short_name_retired';

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
      return `short_name ${input.shortName} 属于一个已删除的用户，永不再分配`;
  }
}
