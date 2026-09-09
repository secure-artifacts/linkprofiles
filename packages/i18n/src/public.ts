import { createI18n, fixedTranslate, type Catalog, type Translate } from './create.js';
import type { Locale } from './locales.js';
import { publicFil } from './messages/fil/public.js';
import { publicEn } from './messages/en/public.js';
import type { PublicKey } from './messages/types.js';
import { publicZhHans } from './messages/zh-Hans/public.js';
import { publicEs } from './messages/es/public.js';
import { publicPtBR } from './messages/pt-BR/public.js';
import { publicId } from './messages/id/public.js';
import { publicVi } from './messages/vi/public.js';

/**
 * 公开页文案全语言静态加载。它只有几条，服务端 SSR 与后台 iframe 预览
 * 都直接消费，拆包省不出什么，反而会给零 hydration 的公开页引入异步。
 */
export const publicCatalog: Catalog = {
  en: { ...publicEn },
  'zh-Hans': publicZhHans,
  fil: publicFil,
  es: publicEs,
  'pt-BR': publicPtBR,
  id: publicId,
  vi: publicVi,
};

const instance = createI18n('public', publicCatalog);

export function publicT(locale: Locale): Translate<PublicKey> {
  return fixedTranslate<PublicKey>(instance, 'public', locale);
}
