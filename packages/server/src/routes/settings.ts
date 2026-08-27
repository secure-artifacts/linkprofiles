import { PASSTHROUGH_CAVEAT } from '@link-profile/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireCapability, UNAUTHORIZED } from '../auth/guards.js';
import { readSettings, writeSettings } from '../settings/repository.js';

const settingsBody = z.object({
  sourcePassthroughDefault: z.boolean().optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  /**
   * 全站设置。所有登录角色都读得到——后台要拿透传的默认值来渲染开关的
   * 初始状态，并把已知取舍的文案显示在旁边。改则只有超级管理员。
   */
  app.get('/settings', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);

    return { ...(await readSettings(app.db)), sourcePassthroughCaveat: PASSTHROUGH_CAVEAT };
  });

  app.patch(
    '/settings',
    { onRequest: [requireCapability('settings:write')] },
    async (req, reply) => {
      const parsed = settingsBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }

      await writeSettings(app.db, parsed.data);
      return { ...(await readSettings(app.db)), sourcePassthroughCaveat: PASSTHROUGH_CAVEAT };
    },
  );
}
