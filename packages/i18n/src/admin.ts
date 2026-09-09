import type { Locale } from './locales.js';
import { adminEn, errorsEn } from './source.js';

export interface AdminBundle {
  admin: Record<string, string>;
  errors: Record<string, string>;
}

/**
 * 后台按语言动态加载，只拉当前语言那一份。相对路径的动态 import 让打包器
 * 能静态分析并切出独立 chunk，主 chunk 不随语言数量增长。
 *
 * 尚未产出译文的语言在这里没有分支，i18next 会回落到英语。
 */
export async function loadAdminBundle(locale: Locale): Promise<AdminBundle> {
  switch (locale) {
    case 'zh-Hans': {
      const [admin, errors] = await Promise.all([
        import('./messages/zh-Hans/admin.js'),
        import('./messages/zh-Hans/errors.js'),
      ]);
      return { admin: admin.adminZhHans, errors: errors.errorsZhHans };
    }
    case 'es': {
      const [admin, errors] = await Promise.all([
        import('./messages/es/admin.js'),
        import('./messages/es/errors.js'),
      ]);
      return { admin: admin.adminEs, errors: errors.errorsEs };
    }
    case 'pt-BR': {
      const [admin, errors] = await Promise.all([
        import('./messages/pt-BR/admin.js'),
        import('./messages/pt-BR/errors.js'),
      ]);
      return { admin: admin.adminPtBR, errors: errors.errorsPtBR };
    }
    case 'id': {
      const [admin, errors] = await Promise.all([
        import('./messages/id/admin.js'),
        import('./messages/id/errors.js'),
      ]);
      return { admin: admin.adminId, errors: errors.errorsId };
    }
    case 'vi': {
      const [admin, errors] = await Promise.all([
        import('./messages/vi/admin.js'),
        import('./messages/vi/errors.js'),
      ]);
      return { admin: admin.adminVi, errors: errors.errorsVi };
    }
    case 'fil': {
      const [admin, errors] = await Promise.all([
        import('./messages/fil/admin.js'),
        import('./messages/fil/errors.js'),
      ]);
      return { admin: admin.adminFil, errors: errors.errorsFil };
    }
    default:
      // 英文是回落语言，本来就静态在主 chunk 里，再动态拉一遍只会多一个请求。
      return { admin: { ...adminEn }, errors: { ...errorsEn } };
  }
}
