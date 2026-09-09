import { isGoogleTestKey } from '@link-profile/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireCapability } from '../auth/guards.js';
import { readSettings, writeSettings } from '../settings/repository.js';
import { fail, unauthorized } from '../http/errors.js';

const settingsBody = z.object({
  sourcePassthroughDefault: z.boolean().optional(),
  registrationEnabled: z.boolean().optional(),
  recaptchaSiteKey: z.string().trim().max(200).optional(),
  recaptchaSecretKey: z.string().trim().max(200).optional(),
});

/**
 * 私钥只进不出：任何接口都不回传它，前端只知道配没配、是不是测试密钥。
 *
 * 「用没用测试密钥」必须在这里判：前端拿不到私钥，只查站点密钥的话，站点
 * 密钥换成真的而私钥还留着测试值时就警告不出来 —— 而恰恰是私钥决定校验
 * 放不放行。
 */
function withoutSecret(row: Awaited<ReturnType<typeof readSettings>>) {
  const { recaptchaSecretKey, ...rest } = row;
  return {
    ...rest,
    recaptchaConfigured: recaptchaSecretKey !== '' && rest.recaptchaSiteKey !== '',
    recaptchaUsesTestKey:
      isGoogleTestKey(rest.recaptchaSiteKey) || isGoogleTestKey(recaptchaSecretKey),
  };
}

export async function settingsRoutes(app: FastifyInstance) {
  /**
   * 全站设置。所有登录角色都读得到——后台要拿透传的默认值来渲染开关的
   * 初始状态。改则只有超级管理员。
   */
  app.get('/settings', async (req, reply) => {
    if (!req.currentUser) return unauthorized(reply);

    return withoutSecret(await readSettings(app.db));
  });

  app.patch(
    '/settings',
    { onRequest: [requireCapability('settings:write')] },
    async (req, reply) => {
      const parsed = settingsBody.safeParse(req.body);
      if (!parsed.success) {
        return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
      }

      await writeSettings(app.db, parsed.data);
      return withoutSecret(await readSettings(app.db));
    },
  );
}
