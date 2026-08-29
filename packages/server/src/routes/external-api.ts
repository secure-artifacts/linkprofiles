import { apiKeyAuditLogs } from '@link-profile/shared/schema';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ContactUpdateError,
  listContactParameters,
  updateContactParameters,
} from '../external-api/contacts.js';
import { authenticateApiKey } from '../external-api/keys.js';

const contactPatch = z
  .object({
    value: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(80).optional(),
    subtitle: z.string().trim().max(80).optional(),
    message: z.string().trim().max(500).optional(),
    directMessage: z.boolean().optional(),
    isLead: z.boolean().optional(),
    passSource: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提交一个要更新的字段');
const updateBody = z.object({
  contacts: z.record(z.string(), contactPatch).refine((value) => Object.keys(value).length > 0),
  createMissing: z.boolean().default(false),
});

const windows = new Map<string, { startedAt: number; count: number }>();
function allowRequest(keyId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const current = windows.get(keyId);
  const bucket =
    !current || now - current.startedAt >= 60_000 ? { startedAt: now, count: 0 } : current;
  bucket.count += 1;
  windows.set(keyId, bucket);
  return { allowed: bucket.count <= 60, remaining: Math.max(0, 60 - bucket.count) };
}

export async function externalApiRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/profiles/:id/contacts', async (req, reply) => {
    const key = await authenticateApiKey(app.db, req.headers.authorization, 'contacts:read');
    if (!key) return reply.code(401).send({ error: 'invalid_api_key' });
    if (key.profileId !== req.params.id)
      return reply.code(403).send({ error: 'profile_forbidden' });
    const limit = allowRequest(key.id);
    reply
      .header('x-ratelimit-limit', '60')
      .header('x-ratelimit-remaining', String(limit.remaining));
    if (!limit.allowed) return reply.code(429).send({ error: 'rate_limit_exceeded' });
    return {
      profileId: key.profileId,
      contacts: await listContactParameters(app.db, key.profileId),
    };
  });

  app.patch<{ Params: { id: string } }>('/profiles/:id/contacts', async (req, reply) => {
    const key = await authenticateApiKey(app.db, req.headers.authorization, 'contacts:write');
    if (!key) return reply.code(401).send({ error: 'invalid_api_key' });
    if (key.profileId !== req.params.id)
      return reply.code(403).send({ error: 'profile_forbidden' });
    const limit = allowRequest(key.id);
    reply
      .header('x-ratelimit-limit', '60')
      .header('x-ratelimit-remaining', String(limit.remaining));
    if (!limit.allowed) return reply.code(429).send({ error: 'rate_limit_exceeded' });

    const parsed = updateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    try {
      const contacts = await updateContactParameters(
        app.db,
        key.profileId,
        parsed.data.contacts,
        parsed.data.createMissing,
      );
      const platforms = Object.keys(parsed.data.contacts);
      await app.db.insert(apiKeyAuditLogs).values({
        apiKeyId: key.id,
        profileId: key.profileId,
        action: 'contacts:update',
        platforms,
      });
      return { profileId: key.profileId, updated: platforms, contacts };
    } catch (error) {
      if (error instanceof ContactUpdateError) {
        return reply.code(422).send({
          error: error.code,
          issues: [{ platform: error.platform, field: 'value', message: error.message }],
        });
      }
      throw error;
    }
  });
}
