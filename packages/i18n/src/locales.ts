/**
 * 界面语言与页面语言的取值。这一套标签同时写进两张表、HTML 语言声明、
 * Accept-Language 协商结果与 Intl 的 locale 参数，四处必须一致。
 *
 * 菲律宾语用 `fil` 而不是 `tl`：CLDR 里两者是不同的数据集，`fil` 是菲律宾
 * 国语的标签，`tl` 指他加禄语这门语言本身。
 */
export const SUPPORTED_LOCALES = ['en', 'zh-Hans', 'fil', 'es', 'pt-BR', 'id', 'vi'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** 拿不到语言上下文时的兜底：404 页、登录失败、外部 API 报错都用它。 */
export const DEFAULT_LOCALE: Locale = 'en';

/** 存量账号与个人页在迁移时回填的值，保证升级当天界面逐字不变。 */
export const LEGACY_LOCALE: Locale = 'zh-Hans';

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALE_SET.has(value);
}

/**
 * 主语言子标签到受支持标签的映射。带地区后缀的请求头（`en-US`、`fil-PH`）
 * 靠它降级；`tl` 是浏览器实际会发的他加禄语代码，一并归到菲律宾语。
 */
const BY_PRIMARY_SUBTAG: Record<string, Locale> = {
  en: 'en',
  zh: 'zh-Hans',
  fil: 'fil',
  tl: 'fil',
  es: 'es',
  pt: 'pt-BR',
  id: 'id',
  vi: 'vi',
};

/** 不受支持时返回 null，由调用方决定兜底成什么。 */
export function normalizeLocale(raw: string | null | undefined): Locale | null {
  if (typeof raw !== 'string') return null;

  const value = raw.trim().replace(/_/g, '-');
  if (value === '') return null;

  for (const locale of SUPPORTED_LOCALES) {
    if (locale.toLowerCase() === value.toLowerCase()) return locale;
  }

  const primary = value.split('-')[0]?.toLowerCase();
  if (!primary) return null;

  return BY_PRIMARY_SUBTAG[primary] ?? null;
}

interface WeightedTag {
  tag: string;
  quality: number;
  order: number;
}

function parseAcceptLanguage(header: string): WeightedTag[] {
  const entries: WeightedTag[] = [];

  header.split(',').forEach((part, order) => {
    const [tag, ...params] = part.trim().split(';');
    if (!tag) return;

    let quality = 1;
    for (const param of params) {
      const [key, value] = param.split('=');
      if (key?.trim() !== 'q') continue;
      const parsed = Number(value);
      // q 写坏的条目直接丢掉，而不是让整个头失效 —— 头是客户端给的，
      // 一个畸形条目不该让其余条目连带作废。
      if (!Number.isFinite(parsed)) return;
      quality = parsed;
    }

    if (quality <= 0) return;
    entries.push({ tag: tag.trim(), quality, order });
  });

  return entries.sort((a, b) => b.quality - a.quality || a.order - b.order);
}

/** 按 Accept-Language 协商出一个受支持的语言，协商不出来时回落英语。 */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (typeof header !== 'string' || header.trim() === '') return DEFAULT_LOCALE;

  for (const { tag } of parseAcceptLanguage(header)) {
    if (tag === '*') continue;
    const locale = normalizeLocale(tag);
    if (locale) return locale;
  }

  return DEFAULT_LOCALE;
}

/**
 * 语言在自己语言里的写法。与品牌名同理，它是数据不是文案 —— 语言选择器
 * 无论当前界面是什么语言都该显示自称，翻译它反而让人找不到自己的语言。
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  fil: 'Filipino',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  id: 'Bahasa Indonesia',
  vi: 'Tiếng Việt',
};
