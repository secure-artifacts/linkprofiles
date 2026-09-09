/**
 * 内置社媒平台清单。
 *
 * **仅含海外平台，绝对不含任何大陆 app**，见 CONTEXT.md。
 * 用户填的是号码、邮箱或用户名，目标 URL 由系统拼装 —— 他们不必了解
 * `wa.me` 与 `mailto:` 的写法。
 *
 * Messenger 是独立条目，指向 `m.me` 直接开对话；Facebook 只是主页。
 * 两者品牌色同为 #0866FF，是 Meta 统一蓝色后的现状，不是笔误，靠图形区分。
 */
import type { ErrorKey } from '@link-profile/i18n';

export type SocialPlatformId =
  | 'whatsapp'
  | 'messenger'
  | 'telegram'
  | 'signal'
  | 'sms'
  | 'phone'
  | 'email'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'tiktok'
  | 'x'
  | 'threads'
  | 'snapchat'
  | 'pinterest'
  | 'linkedin';

/** 用户要填什么，决定后台给什么输入提示，也决定怎么归一化。 */
export type SocialInputKind = 'phone' | 'email' | 'username';

export interface SocialPlatform {
  id: SocialPlatformId;
  /** 品牌专有名词，七种语言写法相同。描述性的平台名另有 labelKey。 */
  label: string;
  brandHex: string;
  inputKind: SocialInputKind;
  /** 联系类渠道默认计入线索，内容类默认不计。用户可在后台逐条修改。 */
  defaultIsLead: boolean;
  /** 非品牌名的平台，界面按这个 key 取译文；品牌名的平台为 null。 */
  labelKey: string | null;
  /** 输入提示的文案 key，文案本身在 i18n 包里，见 ADR-0021。 */
  inputHintKey: string;
  buildUrl: (value: string) => string | null;
}

export interface SocialValueValidation {
  ok: boolean;
  error?: ErrorKey;
}

/** 号码只留数字：用户可能填 `+1 (555) 010-9999`，wa.me 只认数字。 */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** 短信与拨号保留国际号码开头的 +，其余格式字符全部去掉。 */
function dialablePhone(value: string): string | null {
  const trimmed = value.trim();
  const digits = digitsOnly(trimmed);
  if (!digits) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

function validInternationalPhone(value: string): boolean {
  const trimmed = value.trim();
  const digits = digitsOnly(trimmed);
  return /^\+?[\d\s().-]+$/.test(trimmed) && digits.length >= 7 && digits.length <= 15;
}

function validInstagramUsername(value: string): boolean {
  const username = bareUsername(value);
  return (
    username.length >= 1 &&
    username.length <= 30 &&
    /^[A-Za-z0-9_](?:[A-Za-z0-9._]*[A-Za-z0-9_])?$/.test(username) &&
    !username.includes('..')
  );
}

function validMessengerUsername(value: string): boolean {
  const username = bareUsername(value);
  return (
    username.length >= 5 &&
    username.length <= 50 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9.]*[A-Za-z0-9])$/.test(username) &&
    !username.includes('..')
  );
}

/**
 * 只留标识本身。
 *
 * 用户很少老老实实只填用户名 —— 常见的是整条粘过来，而且经常不带协议：
 * `@mimnz`、`instagram.com/mimnz`、`https://www.linkedin.com/in/mimnz/`、
 * `youtube.com/@mimnz?si=xxx` 都要归到 `mimnz`。
 *
 * 这几个平台的标识都是路径的最后一段，所以做法是：去掉查询串与锚点、
 * 去掉首尾的 @ 与斜杠，然后取最后一个非空路径段。
 */
function bareUsername(value: string): string {
  const withoutQuery = value.trim().split(/[?#]/)[0] ?? '';
  const segments = withoutQuery.split('/').filter((segment) => segment !== '');
  const last = segments.at(-1) ?? '';
  return last.replace(/^@+/, '');
}

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    labelKey: null,
    brandHex: '#25D366',
    inputKind: 'phone',
    defaultIsLead: true,
    inputHintKey: 'platform.hint.whatsapp',
    buildUrl: (v) => (validInternationalPhone(v) ? `https://wa.me/${digitsOnly(v)}` : null),
  },
  {
    id: 'messenger',
    label: 'Messenger',
    labelKey: null,
    brandHex: '#0866FF',
    inputKind: 'username',
    defaultIsLead: true,
    inputHintKey: 'platform.hint.messenger',
    buildUrl: (v) => (validMessengerUsername(v) ? `https://m.me/${bareUsername(v)}` : null),
  },
  {
    id: 'telegram',
    label: 'Telegram',
    labelKey: null,
    brandHex: '#26A5E4',
    inputKind: 'username',
    defaultIsLead: true,
    inputHintKey: 'platform.hint.telegram',
    buildUrl: (v) => `https://t.me/${bareUsername(v)}`,
  },
  {
    id: 'signal',
    label: 'Signal',
    labelKey: null,
    brandHex: '#3B45FD',
    inputKind: 'phone',
    defaultIsLead: true,
    inputHintKey: 'platform.hint.signal',
    buildUrl: (v) => `https://signal.me/#p/+${digitsOnly(v)}`,
  },
  {
    id: 'sms',
    label: 'Text message',
    labelKey: 'analytics.platform.sms',
    brandHex: '#34C759',
    inputKind: 'phone',
    defaultIsLead: true,
    inputHintKey: 'platform.hint.sms',
    buildUrl: (v) => {
      if (!validInternationalPhone(v)) return null;
      const number = dialablePhone(v);
      return number ? `sms:${number}` : null;
    },
  },
  {
    id: 'phone',
    label: 'Phone call',
    labelKey: 'analytics.platform.phone',
    brandHex: '#0A84FF',
    inputKind: 'phone',
    defaultIsLead: true,
    inputHintKey: 'platform.hint.phone',
    buildUrl: (v) => {
      if (!validInternationalPhone(v)) return null;
      const number = dialablePhone(v);
      return number ? `tel:${number}` : null;
    },
  },
  {
    id: 'email',
    label: 'Email',
    labelKey: null,
    brandHex: '#4A5058',
    inputKind: 'email',
    defaultIsLead: true,
    inputHintKey: 'platform.hint.email',
    buildUrl: (v) => `mailto:${v.trim()}`,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    labelKey: null,
    brandHex: '#FF0069',
    inputKind: 'username',
    defaultIsLead: false,
    inputHintKey: 'platform.hint.instagram',
    buildUrl: (v) =>
      validInstagramUsername(v) ? `https://instagram.com/${bareUsername(v)}` : null,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    labelKey: null,
    brandHex: '#0866FF',
    inputKind: 'username',
    defaultIsLead: false,
    inputHintKey: 'platform.hint.facebook',
    buildUrl: (v) => `https://facebook.com/${bareUsername(v)}`,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    labelKey: null,
    brandHex: '#FF0000',
    inputKind: 'username',
    defaultIsLead: false,
    inputHintKey: 'platform.hint.youtube',
    buildUrl: (v) => `https://youtube.com/@${bareUsername(v)}`,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    labelKey: null,
    brandHex: '#000000',
    inputKind: 'username',
    defaultIsLead: false,
    inputHintKey: 'platform.hint.tiktok',
    buildUrl: (v) => `https://tiktok.com/@${bareUsername(v)}`,
  },
  {
    id: 'x',
    label: 'X',
    labelKey: null,
    brandHex: '#000000',
    inputKind: 'username',
    defaultIsLead: false,
    inputHintKey: 'platform.hint.x',
    buildUrl: (v) => `https://x.com/${bareUsername(v)}`,
  },
  {
    id: 'threads',
    label: 'Threads',
    labelKey: null,
    brandHex: '#000000',
    inputKind: 'username',
    defaultIsLead: false,
    inputHintKey: 'platform.hint.threads',
    buildUrl: (v) => `https://threads.net/@${bareUsername(v)}`,
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    labelKey: null,
    brandHex: '#FFFC00',
    inputKind: 'username',
    defaultIsLead: false,
    inputHintKey: 'platform.hint.snapchat',
    buildUrl: (v) => `https://snapchat.com/add/${bareUsername(v)}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    labelKey: null,
    brandHex: '#0A66C2',
    inputKind: 'username',
    defaultIsLead: false,
    inputHintKey: 'platform.hint.linkedin',
    buildUrl: (v) => `https://linkedin.com/in/${bareUsername(v)}`,
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    labelKey: null,
    brandHex: '#BD081C',
    inputKind: 'username',
    defaultIsLead: false,
    inputHintKey: 'platform.hint.pinterest',
    buildUrl: (v) => `https://pinterest.com/${bareUsername(v)}`,
  },
];

const BY_ID = new Map(SOCIAL_PLATFORMS.map((p) => [p.id, p]));

export function findSocialPlatform(id: string): SocialPlatform | undefined {
  return BY_ID.get(id as SocialPlatformId);
}

export function isSocialPlatformId(id: string): id is SocialPlatformId {
  return BY_ID.has(id as SocialPlatformId);
}

/** 用户填的值 → 可点击的目标地址。平台不认识时返回 null。 */
export function buildSocialUrl(platformId: string, value: string): string | null {
  const platform = findSocialPlatform(platformId);
  if (!platform) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return platform.buildUrl(trimmed);
}

export function buildSocialTargetUrl(
  platformId: string,
  value: string,
  directMessage = false,
  message = '',
): string | null {
  const url = buildSocialUrl(platformId, value);
  if (!url) return null;
  if (platformId === 'instagram' && directMessage) {
    return `https://ig.me/m/${bareUsername(value)}`;
  }
  const body = message.trim();
  if (body && platformId === 'whatsapp') return `${url}?text=${encodeURIComponent(body)}`;
  if (body && platformId === 'sms') return `${url}?body=${encodeURIComponent(body)}`;
  return url;
}

export function validateSocialValue(platformId: string, value: string): SocialValueValidation {
  if (value.trim() === '') return { ok: false, error: 'field.value.required' };
  if (buildSocialUrl(platformId, value)) return { ok: true };
  if (['whatsapp', 'sms', 'phone', 'signal'].includes(platformId)) {
    return { ok: false, error: 'field.social.phone' };
  }
  if (platformId === 'instagram') return { ok: false, error: 'field.social.instagram' };
  if (platformId === 'messenger') return { ok: false, error: 'field.social.messenger' };
  return { ok: false, error: 'field.social.unbuildable' };
}
