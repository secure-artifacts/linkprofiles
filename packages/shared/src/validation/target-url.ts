/**
 * 按钮目标地址的校验。
 *
 * 只放行能安全塞进 `href` 的协议。`javascript:` 与 `data:` 一概拒绝 ——
 * 公开页把这个值直接渲染成链接，放进去就是一个存储型 XSS。
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:']);

export type TargetUrlResult =
  | { ok: true; value: string }
  | { ok: false; error: '目标链接不能为空' | '目标链接格式不正确' | '目标链接的协议不被允许' };

export function validateTargetUrl(raw: string): TargetUrlResult {
  const value = raw.trim();
  if (value === '') return { ok: false, error: '目标链接不能为空' };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // 没写协议的当 https 补一次，用户常常只打 example.com
    try {
      parsed = new URL(`https://${value}`);
    } catch {
      return { ok: false, error: '目标链接格式不正确' };
    }
    return { ok: true, value: parsed.toString() };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, error: '目标链接的协议不被允许' };
  }

  return { ok: true, value };
}
