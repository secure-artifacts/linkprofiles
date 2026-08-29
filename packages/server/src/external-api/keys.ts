import { createHash, randomBytes } from 'node:crypto';
import { apiKeys } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';

export type ApiKeyScope = 'contacts:read' | 'contacts:write';

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueApiKey(
  db: Db,
  input: {
    profileId: string;
    label: string;
    createdBy: string;
    scopes: ApiKeyScope[];
    expiresAt: Date | null;
  },
) {
  const token = `lp_live_${randomBytes(24).toString('base64url')}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      profileId: input.profileId,
      label: input.label,
      createdBy: input.createdBy,
      scopes: input.scopes,
      expiresAt: input.expiresAt,
      tokenHash: hashApiToken(token),
      tokenPrefix: token.slice(0, 16),
    })
    .returning({
      id: apiKeys.id,
      label: apiKeys.label,
      tokenPrefix: apiKeys.tokenPrefix,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    });
  return { ...row!, token };
}

export async function authenticateApiKey(
  db: Db,
  authorization: string | undefined,
  requiredScope: ApiKeyScope,
) {
  const match = /^Bearer\s+(lp_live_[A-Za-z0-9_-]+)$/i.exec(authorization ?? '');
  if (!match) return null;
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.tokenHash, hashApiToken(match[1]!)))
    .limit(1);
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= new Date())) return null;
  if (!row.scopes.includes(requiredScope)) return null;

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return row;
}
