import { parseUserAgent, sanitizeSource, truncateIp, type DeviceType } from '@link-profile/shared';
import { isbot } from 'isbot';
import type { FastifyRequest } from 'fastify';
import type { GeoLookup } from './geo.js';

export interface VisitorFacts {
  country: string | null;
  city: string | null;
  deviceType: DeviceType;
  os: string | null;
  source: string | null;
  /** 已经截断过的地址。完整 IP 不出这个函数。 */
  ipTruncated: string | null;
}

/**
 * 把一次请求归一化成要落库的维度。
 *
 * **顺序在这里是硬要求**：先用完整 IP 查出国家与城市，**随后立刻截断**。
 * 颠倒过来地域精度就白丢了。完整 IP 只作为局部变量存在，从不返回、
 * 更不落库，见 ADR-0006。
 */
export async function collectVisitorFacts(
  req: FastifyRequest,
  source: string | null | undefined,
  lookupGeo: GeoLookup,
): Promise<VisitorFacts> {
  const fullIp = clientIp(req);

  // 1. 先查地域，用的是完整 IP
  const geo = await lookupGeo(fullIp);

  // 2. 再截断。此后 fullIp 不再被任何人使用
  const ipTruncated = truncateIp(fullIp);

  const ua = parseUserAgent(req.headers['user-agent']);

  return {
    country: geo.country,
    city: geo.city,
    deviceType: ua.deviceType,
    os: ua.os,
    source: sanitizeSource(source),
    ipTruncated,
  };
}

/**
 * 社媒 og 爬虫必然抓取公开页且永不点击，算进去会让点击率的分母虚高 ——
 * 页面越受欢迎数据反而越难看。识别为爬虫就**直接不写记录**，
 * 页面与 og 标签照常返回。
 */
export function isCrawler(req: FastifyRequest): boolean {
  return isbot(req.headers['user-agent']);
}

/**
 * 应用只监听 HTTP，TLS 与反向代理交由运维，因此真实来访 IP 在
 * `X-Forwarded-For` 上。
 *
 * 取 `req.ip` 而不是自己读那个头：`X-Forwarded-For` 是客户端可以随手写的，
 * 直接读第一段等于让任何人把埋点 IP 填成任意值，连带污染地域统计。Fastify
 * 会先按 `trustProxy` 校验这一跳来源可信，再去解析该头，来源不可信就退回
 * socket 地址。代价是 `TRUST_PROXY` 配错时会记成代理地址 —— 那是配置错误，
 * 验收时查一眼就能发现，比静默接受伪造值好。
 */
function clientIp(req: FastifyRequest): string | null {
  return req.ip || null;
}
