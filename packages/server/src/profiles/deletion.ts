import { media, profiles, shortNameTombstones, users } from '@link-profile/shared/schema';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { removeMediaDirectory } from '../media/storage.js';

interface ProfileTarget {
  id: string;
  shortName: string;
}

/** `db.transaction` 回调里拿到的事务句柄。 */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * 墓碑 + 删除 + 清盘，顺序有讲究：
 *
 * 1. 事务外先把要清的磁盘目录查出来 —— 行删掉之后就查不到了
 * 2. 事务内先把 short_name 迁进墓碑再删行，两件事同一个事务，
 *    中途挂掉不会出现「页面没了但地址被放出去」的窗口
 * 3. 最后清磁盘。放在事务之后：文件删了没法回滚，
 *    而残留一个目录远比丢掉一条数据轻
 *
 * 埋点数据**不删**：埋点表刻意没有外键，历史汇总因此不断档。
 */
async function retireAndDelete(
  db: Db,
  targets: ProfileTarget[],
  deleteRows: (tx: Tx) => Promise<unknown>,
): Promise<void> {
  const profileIds = targets.map((t) => t.id);
  const directories = profileIds.length
    ? (
        await db
          .select({ directory: media.directory })
          .from(media)
          .where(inArray(media.profileId, profileIds))
      ).map((r) => r.directory)
    : [];

  await db.transaction(async (tx) => {
    if (targets.length) {
      await tx
        .insert(shortNameTombstones)
        .values(targets.map((t) => ({ shortName: t.shortName, formerProfileId: t.id })))
        // 同一个 short_name 只可能进墓碑一次，重复即无操作
        .onConflictDoNothing();
    }
    await deleteRows(tx);
  });

  for (const directory of directories) {
    await removeMediaDirectory(directory);
  }
}

/** 删一个个人页：它的 short_name 进墓碑，按钮 / 社媒图标 / 媒体随外键级联删除。 */
export async function deleteProfile(db: Db, profileId: string): Promise<void> {
  const [target] = await db
    .select({ id: profiles.id, shortName: profiles.shortName })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!target) return;

  await retireAndDelete(db, [target], (tx) =>
    tx.delete(profiles).where(eq(profiles.id, profileId)),
  );
}

/**
 * 删一个账号：名下**全部**个人页的 short_name 都进墓碑，
 * 个人页与会话随外键级联删除。
 *
 * 账号没有任何个人页时（管理员、超级管理员）不产生墓碑。
 */
export async function deleteUserAccount(db: Db, userId: string): Promise<void> {
  const targets = await db
    .select({ id: profiles.id, shortName: profiles.shortName })
    .from(profiles)
    .where(eq(profiles.userId, userId));

  await retireAndDelete(db, targets, (tx) => tx.delete(users).where(eq(users.id, userId)));
}

/** 这个 short_name 是不是已经退休了。命中墓碑即永不再分配。 */
export async function isRetired(db: Db, shortName: string): Promise<boolean> {
  const [row] = await db
    .select({ shortName: shortNameTombstones.shortName })
    .from(shortNameTombstones)
    .where(eq(shortNameTombstones.shortName, shortName))
    .limit(1);
  return row !== undefined;
}
