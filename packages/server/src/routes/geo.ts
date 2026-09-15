import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireCapability } from '../auth/guards.js';
import { fail } from '../http/errors.js';
import { BACKFILL_BATCH, backfillBatch, countUnresolved } from '../tracking/backfill.js';
import type { GeoStatus } from '../tracking/geo.js';

const backfillBody = z.object({
  after: z.string().min(1).max(64).optional(),
  limit: z.number().int().min(1).max(BACKFILL_BATCH).default(BACKFILL_BATCH),
});

export async function geoRoutes(app: FastifyInstance) {
  const libraryStatus = async (): Promise<GeoStatus> =>
    app.geo.status ? app.geo.status() : { state: 'loaded', path: '', type: '', builtAt: '' };

  app.get('/geo', { onRequest: [requireCapability('geo:backfill')] }, async () => ({
    library: await libraryStatus(),
    unresolved: await countUnresolved(app.sql),
  }));

  /**
   * 一次只补一批，由后台循环调用直到 `next` 为 null。
   * 一次性补完的话，积压多时单个请求会超过反向代理的超时。
   */
  app.post(
    '/geo/backfill',
    { onRequest: [requireCapability('geo:backfill')] },
    async (req, reply) => {
      const parsed = backfillBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
      }

      if ((await libraryStatus()).state !== 'loaded') {
        return fail(reply, 409, 'geo_unavailable');
      }

      return backfillBatch(app.sql, app.geo, parsed.data.after ?? null, parsed.data.limit);
    },
  );
}
