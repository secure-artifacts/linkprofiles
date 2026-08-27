import { buttons, clicks, socialIcons } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { collectVisitorFacts, isCrawler } from '../tracking/visitor.js';

const clickBody = z.object({
  /** 被点的是按钮还是社媒图标 */
  kind: z.enum(['button', 'social']),
  id: z.string().uuid(),
  /** 页面地址上的来源参数，由客户端脚本原样带回 */
  src: z.string().nullish(),
});

export async function trackRoutes(app: FastifyInstance) {
  /**
   * 记一次点击。
   *
   * 目标的归属与 `is_lead` 一律以库里为准，不信客户端传来的：
   * 否则任何人都能往别人的页面上刷线索。落库时把当时的 `is_lead` 定死，
   * 用户事后改标记不该让历史数据跟着变。
   *
   * 不论成功与否都回 204：这个接口是给 `sendBeacon` 用的，
   * 响应体没人读，而把「这个 id 存不存在」告诉调用方毫无必要。
   */
  app.post('/track/click', async (req, reply) => {
    const parsed = clickBody.safeParse(req.body);
    if (!parsed.success) return reply.code(204).send();

    // 爬虫不产生任何埋点记录
    if (isCrawler(req)) return reply.code(204).send();

    const target = await findTarget(app, parsed.data.kind, parsed.data.id);
    if (!target) return reply.code(204).send();

    const facts = await collectVisitorFacts(req, parsed.data.src, app.geo);
    await app.db.insert(clicks).values({
      userId: target.userId,
      targetKind: parsed.data.kind,
      targetId: parsed.data.id,
      isLead: target.isLead,
      ...facts,
    });

    return reply.code(204).send();
  });
}

async function findTarget(
  app: FastifyInstance,
  kind: 'button' | 'social',
  id: string,
): Promise<{ userId: string; isLead: boolean } | null> {
  const table = kind === 'button' ? buttons : socialIcons;
  const [row] = await app.db
    .select({ userId: table.userId, isLead: table.isLead })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  return row ?? null;
}
