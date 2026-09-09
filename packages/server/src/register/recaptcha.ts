/**
 * 注册页的人机验证，用 Google reCAPTCHA v2 复选框版，见 ADR-0022。
 *
 * 选 v2 而不是 v3：v3 是无感打分，站点自己定阈值，用户什么都不做。产品要的是
 * 「用户必须手动验证」，那就是 v2 那个「我不是机器人」的复选框。
 */
const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/**
 * 校验一枚前端交上来的令牌。
 *
 * 做成可注入的依赖：这一步要打 Google 的接口，测试里不能真打，注一个假的进去。
 * 与 `geo` 同一个套路。
 */
export type RecaptchaVerifier = (
  secret: string,
  token: string,
  remoteIp?: string,
) => Promise<boolean>;

export const verifyWithGoogle: RecaptchaVerifier = async (secret, token, remoteIp) => {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  const res = await fetch(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    // Google 挂了或者网络不通时不要把注册接口一起吊死。
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return false;

  const payload = (await res.json()) as { success?: boolean };
  return payload.success === true;
};
