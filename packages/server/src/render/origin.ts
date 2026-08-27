import type { FastifyRequest } from 'fastify';

/**
 * 页面自己的对外来源。
 *
 * og 标签里的地址必须是绝对的，爬虫不解析相对路径。应用只监听 HTTP，
 * 前面通常挂着一层做 TLS 的反向代理，所以协议要从 `X-Forwarded-Proto` 取，
 * 否则分享卡片里会出现 `http://` 的地址。
 *
 * `PUBLIC_ORIGIN` 配了就以它为准 —— 代理头是可以伪造的，而这个值出现在
 * 转发给别人的卡片里。
 */
export function publicOrigin(req: FastifyRequest): string {
  const configured = process.env.PUBLIC_ORIGIN;
  if (configured) return configured.replace(/\/+$/, '');

  const proto = headerValue(req, 'x-forwarded-proto') ?? req.protocol;
  const host = headerValue(req, 'x-forwarded-host') ?? req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

function headerValue(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.split(',')[0]?.trim() || undefined;
}
