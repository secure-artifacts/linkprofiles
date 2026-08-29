import { relations, sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './profiles.js';
import { users } from './users.js';

/** 外部自动化使用的页面级密钥。明文只在创建时出现一次，库里只保存 SHA-256。 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid().primaryKey().defaultRandom(),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    label: text().notNull(),
    tokenHash: text().notNull(),
    tokenPrefix: text().notNull(),
    scopes: text()
      .array()
      .notNull()
      .default(sql`ARRAY['contacts:read', 'contacts:write']::text[]`),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('api_keys_token_hash_unique').on(t.tokenHash),
    index('api_keys_profile_idx').on(t.profileId),
  ],
);

/** 只记调用了哪些平台，不落手机号、用户名和消息正文等敏感内容。 */
export const apiKeyAuditLogs = pgTable(
  'api_key_audit_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    apiKeyId: uuid().references(() => apiKeys.id, { onDelete: 'set null' }),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    action: text().notNull(),
    platforms: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('api_key_audit_profile_created_idx').on(t.profileId, t.createdAt)],
);

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  profile: one(profiles, { fields: [apiKeys.profileId], references: [profiles.id] }),
  creator: one(users, { fields: [apiKeys.createdBy], references: [users.id] }),
  auditLogs: many(apiKeyAuditLogs),
}));

export const apiKeyAuditLogsRelations = relations(apiKeyAuditLogs, ({ one }) => ({
  apiKey: one(apiKeys, { fields: [apiKeyAuditLogs.apiKeyId], references: [apiKeys.id] }),
  profile: one(profiles, { fields: [apiKeyAuditLogs.profileId], references: [profiles.id] }),
}));
