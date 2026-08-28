import { parseBulkUserRows } from '@link-profile/shared';
import { profiles, users } from '@link-profile/shared/schema';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireCapability } from '../auth/guards.js';
import { hashPassword } from '../auth/passwords.js';
import { describeConflict, findUserConflict } from '../users/conflicts.js';

const bulkBody = z.object({
  /** 从 Google Sheet 粘过来的原文，每行四列制表符分隔 */
  text: z.string(),
});

interface BulkFailure {
  line: number;
  error: string;
}

/**
 * 批量创建用户。
 *
 * 逐行处理，**不做整批回滚**：能建的先建好，失败行跳过并带上行号与原因。
 * 管理员粘几十行进来，个别行有问题不该逼他整批重来。
 */
export async function bulkUserRoutes(app: FastifyInstance) {
  app.post('/users/bulk', { onRequest: [requireCapability('user:create')] }, async (req, reply) => {
    const parsed = bulkBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const created: { line: number; id: string; shortName: string }[] = [];
    const failed: BulkFailure[] = [];

    // 同一批里的重复也要挡住，否则第二行会撞上第一行刚建的账号。
    for (const row of parseBulkUserRows(parsed.data.text)) {
      if (!row.ok) {
        failed.push({ line: row.line, error: row.error });
        continue;
      }

      // 与单个创建同一套判定（含墓碑），绕道批量抢注不了已退休的地址
      const conflict = await findUserConflict(app.db, row.value);
      if (conflict) {
        failed.push({ line: row.line, error: describeConflict(conflict, row.value) });
        continue;
      }

      const passwordHash = await hashPassword(row.value.password);
      // 账号与它的第一个个人页同一个事务，与单个创建同一条规则
      const inserted = await app.db.transaction(async (tx) => {
        const [account] = await tx
          .insert(users)
          .values({
            role: 'user',
            account: row.value.account,
            passwordHash,
            label: row.value.label,
            // 批量创建的用户归属于操作者，与单个创建同一条规则。
            owningAdminId: req.currentUser!.id,
          })
          .returning({ id: users.id });

        const [profile] = await tx
          .insert(profiles)
          .values({
            userId: account!.id,
            shortName: row.value.shortName,
            displayName: row.value.shortName,
          })
          .returning({ id: profiles.id, shortName: profiles.shortName });

        return { id: account!.id, shortName: profile!.shortName };
      });

      created.push({ line: row.line, id: inserted.id, shortName: inserted.shortName });
    }

    return { created, failed, createdCount: created.length, failedCount: failed.length };
  });
}
