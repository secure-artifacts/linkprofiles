import { pageViews } from '@link-profile/shared/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { collectVisitorFacts } from './visitor.js';

/**
 * 写一条页面浏览。公开页每渲染一次调用一次。
 * **不做任何访客去重，全部纯计次**，见 ADR-0006。
 */
export async function recordPageView(
  app: FastifyInstance,
  profileId: string,
  req: FastifyRequest,
  source: string | null | undefined,
): Promise<void> {
  const facts = await collectVisitorFacts(req, source, app.geo);
  await app.db.insert(pageViews).values({ profileId, ...facts });
}
