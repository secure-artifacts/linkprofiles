import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => {
    try {
      await app.sql`select 1`;
    } catch {
      return reply.code(503).send({ status: 'error', database: 'unreachable' });
    }
    return { status: 'ok', database: 'ok' };
  });
}
