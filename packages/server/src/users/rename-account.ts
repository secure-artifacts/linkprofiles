import { accountNameChanges, users } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { findUserConflict } from './conflicts.js';

export type RenameAccountResult =
  | { status: 'changed'; account: string }
  | { status: 'unchanged'; account: string }
  | { status: 'not_found' }
  | { status: 'account_taken' };

/** 改登录用户名与写变更流水必须在同一个事务里完成。 */
export async function renameAccount(
  db: Db,
  input: { userId: string; changedBy: string; account: string },
): Promise<RenameAccountResult> {
  const [current] = await db
    .select({ account: users.account })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!current) return { status: 'not_found' };
  if (current.account === input.account) return { status: 'unchanged', account: current.account };

  const conflict = await findUserConflict(db, {
    account: input.account,
    excludeUserId: input.userId,
  });
  if (conflict === 'account_taken') return { status: 'account_taken' };

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ account: input.account, updatedAt: new Date() })
      .where(eq(users.id, input.userId));
    await tx.insert(accountNameChanges).values({
      userId: input.userId,
      changedBy: input.changedBy,
      fromAccount: current.account,
      toAccount: input.account,
    });
  });

  return { status: 'changed', account: input.account };
}
