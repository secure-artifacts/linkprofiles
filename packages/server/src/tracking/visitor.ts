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
 * `X-Forwarded-For` 的第一段上。没有代理时退回 socket 地址。
 */
function clientIp(req: FastifyRequest): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip || null;
}
