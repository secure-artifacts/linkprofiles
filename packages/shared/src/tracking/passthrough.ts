/**
 * 来源透传。
 *
 * 按钮可以逐条开启：开启后跳转目标 URL 上会带上这次访问的来源，
 * 于是「TikTok 来的人点进我的落地页之后做了什么」这条链路接得起来。
 *
 * **已知取舍**：本项目统一用 `src` 而不是 `utm_source`，因此第三方网站的
 * 分析工具（GA 之类）不会自动把它认成来源，透传只在目标是自家页面时有效。
 * 这句话要在后台的开关旁边写清楚，见 `PASSTHROUGH_CAVEAT`。
 */

export const SOURCE_PARAM = 'src';

export const PASSTHROUGH_CAVEAT =
  '本项目统一使用 src 参数而不是 utm_source，因此第三方网站的分析工具（如 Google Analytics）' +
  '不会自动把它识别为来源。透传仅在目标是自家页面时有效。';

/**
 * 把来源挂到目标地址上。
 *
 * - 来源为空、地址认不出来、协议不是 http(s)（`mailto:`、`tel:`）时原样返回
 * - 目标本来就带了 `src` 就不覆盖：用户手写的优先
 */
export function appendSource(url: string, source: string | null): string {
  if (!source) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
  if (parsed.searchParams.has(SOURCE_PARAM)) return url;

  parsed.searchParams.set(SOURCE_PARAM, source);
  return parsed.toString();
}
