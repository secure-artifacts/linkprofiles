/**
 * IP 截断。
 *
 * 不做访客去重（ADR-0006），因此 IP 的唯一用途就是查地域。查完立刻截断
 * 再落库，规避 GDPR / CCPA 下的个人数据风险。**顺序不可颠倒**：
 * 截断必须发生在地域查询之后，否则地域精度就白丢了。
 *
 * - IPv4 去掉最后一段：`203.0.113.42` → `203.0.113.0`
 * - IPv6 去掉后 80 位，只留前 48 位：`2001:db8:85a3:...` → `2001:db8:85a3::`
 */

/** 认不出来的输入返回 null，调用方当作「没有 IP」，不要把脏值落库。 */
export function truncateIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value === '') return null;

  // 反代常见的 `ip:port` 形式，端口对我们没用
  const withoutPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  const candidate = withoutPort?.[1] ?? value;

  if (isIpv4(candidate)) {
    const parts = candidate.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  // IPv4-mapped IPv6（::ffff:203.0.113.42）按 IPv4 处理
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(candidate);
  if (mapped?.[1] && isIpv4(mapped[1])) {
    return truncateIp(mapped[1]);
  }

  if (isIpv6(candidate)) {
    return truncateIpv6(candidate);
  }

  return null;
}

function isIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isIpv6(value: string): boolean {
  if (!value.includes(':')) return false;
  // 允许一次 `::` 压缩，其余必须是 1–4 位十六进制
  if ((value.match(/::/g) ?? []).length > 1) return false;
  return value.split(':').every((group) => group === '' || /^[0-9a-f]{1,4}$/i.test(group));
}

/** 展开成八组，保留前三组（48 位），其余归零。 */
function truncateIpv6(value: string): string {
  const [head = '', tail = ''] = value.split('::');
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = tail === '' ? [] : tail.split(':');

  let groups: string[];
  if (value.includes('::')) {
    const missing = 8 - headGroups.length - tailGroups.length;
    if (missing < 0) return value;
    groups = [...headGroups, ...Array(missing).fill('0'), ...tailGroups];
  } else {
    groups = value.split(':');
    if (groups.length !== 8) return value;
  }

  const kept = groups.slice(0, 3).map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''));
  return `${kept.join(':')}::`;
}
