import {
  DEFAULT_LOCALE,
  negotiateLocale,
  normalizeLocale,
  type AdminKey,
  type ErrorKey,
  type Locale,
  type Translate,
} from '@link-profile/i18n';
import { loadAdminBundle } from '@link-profile/i18n/admin';
import { FIELD_LIMIT_VARS } from '@link-profile/shared';
import { adminEn, adminPluralsEn, errorsEn } from '@link-profile/i18n/source';
import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { useMemo } from 'react';

/**
 * 后台的翻译运行时。
 *
 * 英文源文静态打进主 chunk：它是回落语言，首屏必须同步可用，否则译文到达
 * 之前界面会闪一遍原始 key。其余语言按需动态加载，主 chunk 不随语言数增长。
 */
const instance = i18next.createInstance();

void instance.use(initReactI18next).init({
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  ns: ['admin', 'errors'],
  defaultNS: 'admin',
  resources: { en: { admin: { ...adminEn, ...adminPluralsEn }, errors: { ...errorsEn } } },
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  initImmediate: false,
});

const loaded = new Set<Locale>([DEFAULT_LOCALE]);

/** 切到某种语言，必要时先把它的译文拉下来。 */
export async function applyLocale(locale: Locale): Promise<void> {
  if (!loaded.has(locale)) {
    const bundle = await loadAdminBundle(locale);
    instance.addResourceBundle(locale, 'admin', bundle.admin, true, true);
    instance.addResourceBundle(locale, 'errors', bundle.errors, true, true);
    loaded.add(locale);
  }
  await instance.changeLanguage(locale);
  // 后台外壳是静态 HTML，语言只有到这里才知道；不同步的话读屏会按错的语言发音。
  document.documentElement.lang = locale;
}

/** 当前界面语言。API 客户端拿它填 Accept-Language。 */
export function currentLocale(): Locale {
  return normalizeLocale(instance.language) ?? DEFAULT_LOCALE;
}

/** 还没登录时只有浏览器语言这一个线索。 */
export function browserLocale(): Locale {
  return negotiateLocale(navigator.languages?.join(',') ?? navigator.language);
}

export function useAdminT(): Translate<AdminKey> {
  const { t } = useTranslation('admin', { i18n: instance });
  return t as unknown as Translate<AdminKey>;
}

/** 当前界面语言，语言切换后随之更新。日期与国家名的格式化用它。 */
export function useLocale(): Locale {
  const { i18n } = useTranslation('admin', { i18n: instance });
  return normalizeLocale(i18n.language) ?? DEFAULT_LOCALE;
}

/**
 * 长度类错误文案的上下限没有调用点会记得传，统一在这里兜底；已给的同名参数优先。
 */
export function useErrorT(): Translate<ErrorKey> {
  const { t } = useTranslation('errors', { i18n: instance });
  return useMemo(
    () =>
      ((key: ErrorKey, vars?: Record<string, unknown>) =>
        t(key as never, { ...FIELD_LIMIT_VARS, ...vars })) as unknown as Translate<ErrorKey>,
    [t],
  );
}

/** 给非组件代码用，例如在纯函数里抛一个带文案的错误。 */
export function translateAdmin(key: AdminKey, vars?: Record<string, unknown>): string {
  return instance.getFixedT(instance.language, 'admin')(key, vars) as unknown as string;
}

/** 给非组件代码用，例如把服务端返回的错误码翻成人话。 */
export function translateError(key: ErrorKey, vars?: Record<string, unknown>): string {
  return instance.getFixedT(instance.language, 'errors')(key, {
    ...FIELD_LIMIT_VARS,
    ...vars,
  }) as unknown as string;
}
