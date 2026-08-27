import { users, type NewUserRow } from '@link-profile/shared/schema';
import type { Db } from '../../src/db/client.js';

let seq = 0;

/** 建一个拥有个人页的用户。只填测试关心的字段，其余给出可辨认的默认值。 */
export async function createUser(db: Db, overrides: Partial<NewUserRow> = {}) {
  seq += 1;
  const [row] = await db
    .insert(users)
    .values({
      role: 'user',
      account: `account-${seq}`,
      passwordHash: 'not-a-real-hash',
      label: `用户 ${seq}`,
      shortName: `user-${seq}`,
      displayName: `显示名 ${seq}`,
      bio: '',
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('创建用户失败');
  return row;
}

/** 建一个能真正登录的账号：密码走 argon2，与生产同一条路径。 */
export async function createLoginableUser(
  db: Db,
  password: string,
  overrides: Partial<NewUserRow> = {},
) {
  const { hashPassword } = await import('../../src/auth/passwords.js');
  return createUser(db, { ...overrides, passwordHash: await hashPassword(password) });
}
