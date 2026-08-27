import { media, shortNameTombstones, users } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { removeMediaDirectory } from '../media/storage.js';

/**
 * 删除一个用户，并把善后一次做完。
 *
 * 三件事的顺序有讲究：
 * 1. 先把 short_name 迁进墓碑 —— 迁移与删除在同一个事务里，
 *    中途挂掉不会出现「用户没了但地址被放出去」的窗口
 * 2. 再删用户行，按钮、社媒图标、会话、媒体记录随外键级联删除
 * 3. 最后清磁盘上的文件。放在事务之后：文件删了没法回滚，
 *    而残留一个目录远比丢掉一条数据轻
 *
 * 埋点数据**不删**：埋点表刻意没有指向 users 的外键，历史汇总因此不断档。
 */
export async function deleteUserAndRetireShortName(db: Db, userId: string): Promise<void> {
  const [target] = await db
    .select({ shortName: users.shortName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) return;

  const directories = (
    await db.select({ directory: media.directory }).from(media).where(eq(media.userId, userId))
  ).map((r) => r.directory);

  await db.transaction(async (tx) => {
    if (target.shortName) {
      await tx
        .insert(shortNameTombstones)
        .values({ shortName: target.shortName, formerUserId: userId })
        // 同一个 short_name 只可能进墓碑一次，重复即无操作
        .onConflictDoNothing();
    }
    await tx.delete(users).where(eq(users.id, userId));
  });

  for (const directory of directories) {
    await removeMediaDirectory(directory);
  }
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
