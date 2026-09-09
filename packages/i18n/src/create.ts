import { createInstance, type i18n as I18nInstance } from 'i18next';
import { DEFAULT_LOCALE, type Locale } from './locales.js';

export type Namespace = 'admin' | 'public' | 'errors';

/** 带插值的翻译函数。key 的联合类型由英文源文推导，拼错时 typecheck 失败。 */
export type Translate<Key extends string> = (key: Key, vars?: Record<string, unknown>) => string;

export type Catalog = Partial<Record<Locale, Record<string, string>>>;

/**
 * key 本身带点（`meta.title.fallback`），交给 i18next 当嵌套分隔符会被拆错，
 * 因此两个分隔符都关掉，命名空间一律显式传。
 *
 * 转义交给消费方：服务端渲染走既有的 HTML 转义，后台走 React，
 * 在这里再转一次会变成双重转义。
 */
export function createI18n(ns: Namespace, catalog: Catalog): I18nInstance {
  const instance = createInstance();

  void instance.init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    ns: [ns],
    defaultNS: ns,
    resources: Object.fromEntries(
      Object.entries(catalog).map(([locale, messages]) => [locale, { [ns]: messages }]),
    ),
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    initImmediate: false,
  });

  return instance;
}

/** 从固定实例上按语言取翻译函数，不为每次调用新建实例。 */
export function fixedTranslate<Key extends string>(
  instance: I18nInstance,
  ns: Namespace,
  locale: Locale,
): Translate<Key> {
  return instance.getFixedT(locale, ns) as Translate<Key>;
}
