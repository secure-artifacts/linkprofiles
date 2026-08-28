import { buttons, clicks } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { collectVisitorFacts, isCrawler } from '../tracking/visitor.js';

const clickBody = z.object({
  /**
   * 老版页面脚本还在发这个字段。合表之后它不再参与查询与落库 —— 目标是哪一类
   * 以库里的 `buttons.kind` 为准。保留只为让旧脚本的请求体仍能通过校验。
   */
  kind: z.enum(['button', 'social']).optional(),
  id: z.string().uuid(),
  /** 页面地址上的来源参数，由客户端脚本原样带回 */
  src: z.string().nullish(),
});

export async function trackRoutes(app: FastifyInstance) {
  /**
   * 记一次点击。
   *
   * 目标的归属、`is_lead` 与类别一律以库里为准，不信客户端传来的：
   * 否则任何人都能往别人的页面上刷线索、或让 `target_id` 与 `target_kind`
   * 对不上。落库时把当时的 `is_lead` 定死，用户事后改标记不该让历史数据跟着变。
   *
   * 不论成功与否都回 204：这个接口是给 `sendBeacon` 用的，
   * 响应体没人读，而把「这个 id 存不存在」告诉调用方毫无必要。
   */
  app.post('/track/click', async (req, reply) => {
    const parsed = clickBody.safeParse(req.body);
    if (!parsed.success) return reply.code(204).send();

    // 爬虫不产生任何埋点记录
    if (isCrawler(req)) return reply.code(204).send();

    const target = await findTarget(app, parsed.data.id);
    if (!target) return reply.code(204).send();

    const facts = await collectVisitorFacts(req, parsed.data.src, app.geo);
    await app.db.insert(clicks).values({
      profileId: target.profileId,
      // `clicks.click_target` 的历史取值是 button/social，与 `buttons.kind`
      // 的 link/social 不同名，这里映射一下，不去动那个枚举。
      targetKind: target.kind === 'social' ? 'social' : 'button',
      targetId: parsed.data.id,
      isLead: target.isLead,
      ...facts,
    });

    return reply.code(204).send();
  });
}

async function findTarget(
  app: FastifyInstance,
  id: string,
): Promise<{ profileId: string; isLead: boolean; kind: 'link' | 'social' } | null> {
  const [row] = await app.db
    .select({ profileId: buttons.profileId, isLead: buttons.isLead, kind: buttons.kind })
    .from(buttons)
    .where(eq(buttons.id, id))
    .limit(1);
  return row ?? null;
}
