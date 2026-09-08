const SOURCE_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  direct: '直接访问',
};

export const sourceLabel = (key: string) =>
  key ? (SOURCE_LABELS[key] ?? key) : '直接访问 / 未标记';

const PLATFORM_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  facebook: 'Facebook',
  sms: '短信',
  phone: '电话',
  email: '邮件',
  telegram: 'Telegram',
  custom: '自定义链接',
  unknown: '其他',
};

export const platformLabel = (key: string) => (PLATFORM_LABELS[key] ?? key) || '其他';

const countryNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' });

export const countryLabel = (key: string) =>
  key ? (countryNames.of(key.toUpperCase()) ?? key) : '未知国家';

export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
