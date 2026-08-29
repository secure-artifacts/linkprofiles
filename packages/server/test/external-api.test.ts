import { apiKeyAuditLogs, apiKeys, buttons } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let token: string;
let profileId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  const user = await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'api-user',
    shortName: 'api-user',
  });
  profileId = user.profileId!;
  token = (await login(ctx, 'api-user', 'user-pass')).token;
  await ctx.db.insert(buttons).values({
    profileId,
    kind: 'social',
    title: 'WhatsApp',
    platform: 'whatsapp',
    value: '+15550109999',
    position: 0,
    isLead: true,
  });
});

async function createKey(scopes = ['contacts:read', 'contacts:write']) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/_api/profiles/${profileId}/api-keys`,
    ...withSession(token),
    payload: { label: 'CRM', scopes },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; token: string; tokenPrefix: string };
}

test('创建时只显示一次明文，数据库只保存哈希', async () => {
  const created = await createKey();
  expect(created.token).toMatch(/^lp_live_/);
  const [stored] = await ctx.db.select().from(apiKeys).where(eq(apiKeys.id, created.id));
  expect(stored!.tokenHash).not.toBe(created.token);
  expect(stored!.tokenPrefix).toBe(created.tokenPrefix);
  const listed = await ctx.app.inject({
    method: 'GET',
    url: `/_api/profiles/${profileId}/api-keys`,
    ...withSession(token),
  });
  expect(listed.body).not.toContain(created.token);
});

test('局部更新保留按钮 id，并生成 WhatsApp 预设消息链接', async () => {
  const key = await createKey();
  const [before] = await ctx.db.select().from(buttons).where(eq(buttons.profileId, profileId));
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/v1/profiles/${profileId}/contacts`,
    headers: { authorization: `Bearer ${key.token}` },
    payload: { contacts: { whatsapp: { value: '+64211234567', message: '你好，我想了解更多' } } },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().contacts[0].targetUrl).toContain('https://wa.me/64211234567?text=');
  const [after] = await ctx.db.select().from(buttons).where(eq(buttons.profileId, profileId));
  expect(after!.id).toBe(before!.id);
  expect(after).toMatchObject({ value: '+64211234567', message: '你好，我想了解更多' });
  expect(await ctx.db.select().from(apiKeyAuditLogs)).toHaveLength(1);
});

test('createMissing 可添加 Instagram，默认直达私信', async () => {
  const key = await createKey();
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/v1/profiles/${profileId}/contacts`,
    headers: { authorization: `Bearer ${key.token}` },
    payload: { createMissing: true, contacts: { instagram: { value: '@clarepolly20' } } },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().contacts[0]).toMatchObject({
    platform: 'instagram',
    directMessage: true,
    targetUrl: 'https://ig.me/m/clarepolly20',
  });
});

test('任一平台校验失败时整批不写入', async () => {
  const key = await createKey();
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/v1/profiles/${profileId}/contacts`,
    headers: { authorization: `Bearer ${key.token}` },
    payload: {
      contacts: {
        whatsapp: { value: '+64211234567' },
        messenger: { value: 'bad!' },
      },
      createMissing: true,
    },
  });
  expect(res.statusCode).toBe(422);
  const [whatsapp] = await ctx.db.select().from(buttons).where(eq(buttons.profileId, profileId));
  expect(whatsapp!.value).toBe('+15550109999');
});

test('只读密钥不能更新，停用后也不能读取', async () => {
  const key = await createKey(['contacts:read']);
  const denied = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/v1/profiles/${profileId}/contacts`,
    headers: { authorization: `Bearer ${key.token}` },
    payload: { contacts: { whatsapp: { value: '+64211234567' } } },
  });
  expect(denied.statusCode).toBe(401);
  await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/profiles/${profileId}/api-keys/${key.id}`,
    ...withSession(token),
  });
  const revoked = await ctx.app.inject({
    method: 'GET',
    url: `/_api/v1/profiles/${profileId}/contacts`,
    headers: { authorization: `Bearer ${key.token}` },
  });
  expect(revoked.statusCode).toBe(401);
});
