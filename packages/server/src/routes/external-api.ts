import { apiKeyAuditLogs } from '@link-profile/shared/schema';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ContactUpdateError,
  listContactParameters,
  updateContactParameters,
} from '../external-api/contacts.js';
import { authenticateApiKey } from '../external-api/keys.js';
import { EXTERNAL_LOCALE, fail } from '../http/errors.js';

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
  .refine((value) => Object.keys(value).length > 0, 'field.atLeastOne');
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
    if (!key) return fail(reply, 401, 'invalid_api_key', { locale: EXTERNAL_LOCALE });
    if (key.profileId !== req.params.id)
      return fail(reply, 403, 'profile_forbidden', { locale: EXTERNAL_LOCALE });
    const limit = allowRequest(key.id);
    reply
      .header('x-ratelimit-limit', '60')
      .header('x-ratelimit-remaining', String(limit.remaining));
    if (!limit.allowed) return fail(reply, 429, 'rate_limit_exceeded', { locale: EXTERNAL_LOCALE });
    return {
      profileId: key.profileId,
      contacts: await listContactParameters(app.db, key.profileId),
    };
  });

  app.patch<{ Params: { id: string } }>('/profiles/:id/contacts', async (req, reply) => {
    const key = await authenticateApiKey(app.db, req.headers.authorization, 'contacts:write');
    if (!key) return fail(reply, 401, 'invalid_api_key', { locale: EXTERNAL_LOCALE });
    if (key.profileId !== req.params.id)
      return fail(reply, 403, 'profile_forbidden', { locale: EXTERNAL_LOCALE });
    const limit = allowRequest(key.id);
    reply
      .header('x-ratelimit-limit', '60')
      .header('x-ratelimit-remaining', String(limit.remaining));
    if (!limit.allowed) return fail(reply, 429, 'rate_limit_exceeded', { locale: EXTERNAL_LOCALE });

    const parsed = updateBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', {
        locale: EXTERNAL_LOCALE,
        issues: parsed.error.issues,
      });
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
        return fail(reply, 422, error.code, {
          locale: EXTERNAL_LOCALE,
          issues: [{ platform: error.platform, field: 'value', message: error.messageKey }],
        });
      }
      throw error;
    }
  });
}
