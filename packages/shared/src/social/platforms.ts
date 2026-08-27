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

export type SocialPlatformId =
  | 'whatsapp'
  | 'messenger'
  | 'telegram'
  | 'signal'
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
  label: string;
  brandHex: string;
  inputKind: SocialInputKind;
  /** 联系类渠道默认计入线索，内容类默认不计。用户可在后台逐条修改。 */
  defaultIsLead: boolean;
  inputHint: string;
  buildUrl: (value: string) => string;
}

/** 号码只留数字：用户可能填 `+1 (555) 010-9999`，wa.me 只认数字。 */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
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
    brandHex: '#25D366',
    inputKind: 'phone',
    defaultIsLead: true,
    inputHint: '带国际区号的号码，如 +1 555 010 9999',
    buildUrl: (v) => `https://wa.me/${digitsOnly(v)}`,
  },
  {
    id: 'messenger',
    label: 'Messenger',
    brandHex: '#0866FF',
    inputKind: 'username',
    defaultIsLead: true,
    inputHint: 'Messenger 用户名，直接开对话而不是跳主页',
    buildUrl: (v) => `https://m.me/${bareUsername(v)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    brandHex: '#26A5E4',
    inputKind: 'username',
    defaultIsLead: true,
    inputHint: 'Telegram 用户名，不含 @',
    buildUrl: (v) => `https://t.me/${bareUsername(v)}`,
  },
  {
    id: 'signal',
    label: 'Signal',
    brandHex: '#3B45FD',
    inputKind: 'phone',
    defaultIsLead: true,
    inputHint: '带国际区号的号码',
    buildUrl: (v) => `https://signal.me/#p/+${digitsOnly(v)}`,
  },
  {
    id: 'email',
    label: 'Email',
    brandHex: '#4A5058',
    inputKind: 'email',
    defaultIsLead: true,
    inputHint: '邮箱地址，点击直接唤起邮件客户端',
    buildUrl: (v) => `mailto:${v.trim()}`,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    brandHex: '#FF0069',
    inputKind: 'username',
    defaultIsLead: false,
    inputHint: 'Instagram 用户名，不含 @',
    buildUrl: (v) => `https://instagram.com/${bareUsername(v)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    brandHex: '#0866FF',
    inputKind: 'username',
    defaultIsLead: false,
    inputHint: 'Facebook 主页用户名',
    buildUrl: (v) => `https://facebook.com/${bareUsername(v)}`,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    brandHex: '#FF0000',
    inputKind: 'username',
    defaultIsLead: false,
    inputHint: '频道 handle，不含 @',
    buildUrl: (v) => `https://youtube.com/@${bareUsername(v)}`,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    brandHex: '#000000',
    inputKind: 'username',
    defaultIsLead: false,
    inputHint: 'TikTok 用户名，不含 @',
    buildUrl: (v) => `https://tiktok.com/@${bareUsername(v)}`,
  },
  {
    id: 'x',
    label: 'X',
    brandHex: '#000000',
    inputKind: 'username',
    defaultIsLead: false,
    inputHint: 'X 用户名，不含 @',
    buildUrl: (v) => `https://x.com/${bareUsername(v)}`,
  },
  {
    id: 'threads',
    label: 'Threads',
    brandHex: '#000000',
    inputKind: 'username',
    defaultIsLead: false,
    inputHint: 'Threads 用户名，不含 @',
    buildUrl: (v) => `https://threads.net/@${bareUsername(v)}`,
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    brandHex: '#FFFC00',
    inputKind: 'username',
    defaultIsLead: false,
    inputHint: 'Snapchat 用户名',
    buildUrl: (v) => `https://snapchat.com/add/${bareUsername(v)}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    brandHex: '#0A66C2',
    inputKind: 'username',
    defaultIsLead: false,
    inputHint: '个人主页的自定义地址，即 linkedin.com/in/ 后面那一段',
    buildUrl: (v) => `https://linkedin.com/in/${bareUsername(v)}`,
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    brandHex: '#BD081C',
    inputKind: 'username',
    defaultIsLead: false,
    inputHint: 'Pinterest 用户名',
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
