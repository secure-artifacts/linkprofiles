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

const countryNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' });

export const countryLabel = (key: string) =>
  key ? (countryNames.of(key.toUpperCase()) ?? key) : '未知国家';

export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
