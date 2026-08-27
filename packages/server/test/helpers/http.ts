import type { LightMyRequestResponse } from 'fastify';
import type { TestContext } from './context.js';

export const SESSION_COOKIE = 'lp_session';

/** 从响应里取出会话 cookie 的值，取不到返回空串。 */
export function sessionCookieOf(res: LightMyRequestResponse): string {
  const cookies = res.cookies as { name: string; value: string }[];
  return cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '';
}

/** 走真正的登录接口拿会话，测试里不去手搓 cookie。 */
export async function login(ctx: TestContext, account: string, password: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/auth/login',
    payload: { account, password },
  });
  return { res, token: sessionCookieOf(res) };
}

export function withSession(token: string) {
  return { cookies: { [SESSION_COOKIE]: token } };
}
