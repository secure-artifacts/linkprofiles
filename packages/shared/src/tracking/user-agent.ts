import { UAParser } from 'ua-parser-js';

/**
 * User-Agent 解析为设备类型与操作系统。
 *
 * 维度只要这两项，因此把 ua-parser-js 的一大堆结果压成一个小得多的形状：
 * 后台图表里「手机 / 平板 / 桌面」三档，加上操作系统名。
 */

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export interface UserAgentInfo {
  deviceType: DeviceType;
  os: string | null;
}

export function parseUserAgent(ua: string | null | undefined): UserAgentInfo {
  if (!ua || ua.trim() === '') return { deviceType: 'unknown', os: null };

  const parsed = new UAParser(ua).getResult();

  return { deviceType: toDeviceType(parsed.device.type), os: parsed.os.name ?? null };
}

/**
 * ua-parser-js 的 device.type 在桌面浏览器上是 undefined，
 * 另外还会给出 console / smarttv / wearable / embedded 这些我们不分档的值。
 * 归并规则：手机与平板各自成档，其余认得出的都算桌面，认不出的才是 unknown。
 */
function toDeviceType(type: string | undefined): DeviceType {
  switch (type) {
    case 'mobile':
      return 'mobile';
    case 'tablet':
      return 'tablet';
    case undefined:
      return 'desktop';
    default:
      return 'desktop';
  }
}
