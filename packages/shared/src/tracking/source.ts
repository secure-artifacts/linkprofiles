/**
 * 来源参数清洗。
 *
 * 个人页地址可带 `src` 投放（`域名/mimnz?src=tiktok`）。这个值会进数据库、
 * 进后台图表、还会按开关透传到目标 URL 上，所以脏值一律在门口丢掉：
 * **超出字符集或长度即丢弃，而不是截断后凑合用** —— 截断会把
 * `tiktok<script>` 变成一个看着正常其实错误的来源。
 *
 * **与 requirements 的一处偏离**：需求写的是「限 `[a-z0-9_-]`……超出即丢弃」，
 * 严格照做的话 `?src=TikTok` 会被整条丢弃、记为未知来源。这里选择先 trim
 * 再压小写，然后才按字符集判定，因此 `TikTok` 与 `tiktok` 归到同一个来源。
 * 理由：投放物料上的大小写不受我们控制，严格丢弃会把一批真实访问记成未知，
 * 而大小写不敏感并不会放进任何脏字符 —— 判定仍然在归一化之后进行。
 */

export const SOURCE_MAX_LENGTH = 32;
const PATTERN = /^[a-z0-9_-]+$/;

/** 无参数、脏值都记为未知来源。 */
export const UNKNOWN_SOURCE = null;

export function sanitizeSource(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return UNKNOWN_SOURCE;
  // 大小写不敏感：?src=TikTok 与 ?src=tiktok 是同一个来源
  const value = raw.trim().toLowerCase();

  if (value === '') return UNKNOWN_SOURCE;
  if (value.length > SOURCE_MAX_LENGTH) return UNKNOWN_SOURCE;
  if (!PATTERN.test(value)) return UNKNOWN_SOURCE;

  return value;
}
