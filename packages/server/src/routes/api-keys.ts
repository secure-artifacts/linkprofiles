import { apiKeys } from '@link-profile/shared/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FORBIDDEN, UNAUTHORIZED } from '../auth/guards.js';
import { issueApiKey, type ApiKeyScope } from '../external-api/keys.js';
import { resolveProfileAccess } from '../profiles/access.js';

const createBody = z.object({
  label: z.string().trim().min(1).max(60),
  scopes: z
    .array(z.enum(['contacts:read', 'contacts:write']))
    .min(1)
    .default(['contacts:read', 'contacts:write']),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function apiKeyRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/profiles/:id/api-keys', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'read');
    if (!target) return reply.code(403).send(FORBIDDEN);

    const rows = await app.db
      .select({
        id: apiKeys.id,
        label: apiKeys.label,
        tokenPrefix: apiKeys.tokenPrefix,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.profileId, target), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt));
    return { keys: rows };
  });

  app.post<{ Params: { id: string } }>('/profiles/:id/api-keys', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'update');
    if (!target) return reply.code(403).send(FORBIDDEN);

    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      return reply.code(400).send({ error: 'invalid_expiry', message: '有效期必须晚于当前时间' });
    }
    const created = await issueApiKey(app.db, {
      profileId: target,
      label: parsed.data.label,
      createdBy: req.currentUser.id,
      scopes: parsed.data.scopes as ApiKeyScope[],
      expiresAt,
    });
    return reply.code(201).send(created);
  });

  app.delete<{ Params: { id: string; keyId: string } }>(
    '/profiles/:id/api-keys/:keyId',
    async (req, reply) => {
      if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
      const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'update');
      if (!target) return reply.code(403).send(FORBIDDEN);
      await app.db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, req.params.keyId), eq(apiKeys.profileId, target)));
      return reply.code(204).send();
    },
  );
}
