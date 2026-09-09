import { createI18n, fixedTranslate, type Catalog, type Translate } from './create.js';
import type { Locale } from './locales.js';
import { errorsFil } from './messages/fil/errors.js';
import { errorsEn } from './messages/en/errors.js';
import type { ErrorKey } from './messages/types.js';
import { errorsZhHans } from './messages/zh-Hans/errors.js';
import { errorsEs } from './messages/es/errors.js';
import { errorsPtBR } from './messages/pt-BR/errors.js';
import { errorsId } from './messages/id/errors.js';
import { errorsVi } from './messages/vi/errors.js';

export const errorsCatalog: Catalog = {
  en: { ...errorsEn },
  'zh-Hans': errorsZhHans,
  fil: errorsFil,
  es: errorsEs,
  'pt-BR': errorsPtBR,
  id: errorsId,
  vi: errorsVi,
};

const instance = createI18n('errors', errorsCatalog);

/** 服务端按请求语言渲染自己产出的 message；拿不到语言时调用方传 DEFAULT_LOCALE。 */
export function errorT(locale: Locale): Translate<ErrorKey> {
  return fixedTranslate<ErrorKey>(instance, 'errors', locale);
}
