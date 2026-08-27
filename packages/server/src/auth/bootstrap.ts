import { users } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { hashPassword } from './passwords.js';

export interface BootstrapOptions {
  account: string | undefined;
  password: string | undefined;
}

export type BootstrapResult = 'created' | 'already-exists' | 'skipped';

/**
 * 首次启动时按环境变量创建超级管理员。
 *
 * 幂等：库里已经有超级管理员就跳过，重复启动不会重复创建，也不会
 * 用环境变量去覆盖已有账号的密码 —— 否则改一次 compose 文件就等于
 * 悄悄重置了线上密码。
 */
export async function bootstrapSuperadmin(
  db: Db,
  { account, password }: BootstrapOptions,
): Promise<BootstrapResult> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'superadmin'))
    .limit(1);

  if (existing) return 'already-exists';
  if (!account || !password) return 'skipped';

  await db.insert(users).values({
    role: 'superadmin',
    account,
    passwordHash: await hashPassword(password),
    label: '超级管理员',
  });

  return 'created';
}
