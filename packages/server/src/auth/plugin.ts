import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { resolveSession, SESSION_COOKIE, type CurrentUser } from './sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: CurrentUser | null;
  }
  interface FastifyInstance {
    /** 未登录即 401。受保护接口一律挂这个 preHandler。 */
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(cookie);

  app.decorateRequest('currentUser', null);

  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    req.currentUser = token ? await resolveSession(app.db, token) : null;
  });

  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.currentUser) {
      // 在任何资源查找之前就拒绝，响应里不含任何「资源是否存在」的线索。
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });
});
