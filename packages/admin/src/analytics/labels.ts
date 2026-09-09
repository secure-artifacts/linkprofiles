import type { Locale } from '@link-profile/i18n';
import type { useAdminT } from '../i18n/runtime.js';

type T = ReturnType<typeof useAdminT>;

/**
 * 品牌专有名词七种语言写法相同，属于数据而不是文案，不进译文目录；
 * 需要翻译的只有描述性的那几个，见 ADR-0021 末节。
 */
const SOURCE_BRANDS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
};

export const sourceLabel = (t: T, key: string): string => {
  if (!key) return t('analytics.source.unknown');
  if (key === 'direct') return t('analytics.source.direct');
  return SOURCE_BRANDS[key] ?? key;
};

const PLATFORM_BRANDS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  facebook: 'Facebook',
  telegram: 'Telegram',
};

const PLATFORM_KEYS = {
  sms: 'analytics.platform.sms',
  phone: 'analytics.platform.phone',
  email: 'analytics.platform.email',
  custom: 'analytics.platform.custom',
  unknown: 'analytics.platform.other',
} as const;

export const platformLabel = (t: T, key: string): string => {
  const brand = PLATFORM_BRANDS[key];
  if (brand) return brand;
  const messageKey = PLATFORM_KEYS[key as keyof typeof PLATFORM_KEYS];
  return messageKey ? t(messageKey) : key || t('analytics.platform.other');
};

/** 国家名跟界面语言走，用 Intl 的现成数据，不自己维护一张表。 */
export const countryLabel = (t: T, locale: Locale, key: string): string => {
  if (!key) return t('analytics.country.unknown');
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return names.of(key.toUpperCase()) ?? key;
};

export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
