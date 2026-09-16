import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { z } from 'zod';
import {
  debugQueryToken,
  DEFAULT_ROW_LIMIT,
  isDebugToken,
  MAX_ROW_LIMIT,
  MIN_TOKEN_LENGTH,
  rejectReason,
  runReadOnlyQuery,
} from '../debug/query.js';
import { fail } from '../http/errors.js';

const queryBody = z.object({
  sql: z.string().trim().min(1).max(20_000),
  limit: z.number().int().min(1).max(MAX_ROW_LIMIT).default(DEFAULT_ROW_LIMIT),
});

export async function debugQueryRoutes(app: FastifyInstance) {
  if (debugQueryToken() === null) {
    app.log.warn(
      `DEBUG_QUERY_TOKEN 未设置或短于 ${MIN_TOKEN_LENGTH} 字符，只读 SQL 排查接口不会放行任何请求`,
    );
  }

  app.post('/debug/query', async (req, reply) => {
    if (!isDebugToken(req.headers['x-debug-token'])) return fail(reply, 401, 'unauthorized');

    const parsed = queryBody.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });

    const reason = rejectReason(parsed.data.sql);
    if (reason) return fail(reply, 400, 'query_rejected', { reason });

    try {
      return await runReadOnlyQuery(app.sql, parsed.data.sql, parsed.data.limit);
    } catch (err) {
      if (err instanceof postgres.PostgresError) {
        return fail(reply, 400, 'query_failed', { code: err.code, detail: err.message });
      }
      throw err;
    }
  });
}
