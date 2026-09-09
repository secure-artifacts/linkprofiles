import { describe, expect, test } from 'vitest';
import { errorsCatalog } from '../errors.js';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '../locales.js';
import { publicCatalog } from '../public.js';
import { loadAdminBundle } from '../admin.js';
import { adminEn } from './en/admin.js';
import { errorsEn } from './en/errors.js';
import { publicEn } from './en/public.js';
import type { Catalog } from '../create.js';

/** 七种语言全部产出译文，对齐检查逐一覆盖。 */
const TRANSLATED: Locale[] = [...SUPPORTED_LOCALES];

function expectAligned(name: string, catalog: Catalog, source: Record<string, string>) {
  const sourceKeys = Object.keys(source).sort();

  for (const locale of TRANSLATED) {
    const messages = catalog[locale];
    expect(messages, `${name} 缺少 ${locale}`).toBeDefined();
    expect(
      Object.keys(messages ?? {}).sort(),
      `${name} / ${locale} 的 key 与英文源文不一致`,
    ).toEqual(sourceKeys);

    for (const [key, value] of Object.entries(messages ?? {})) {
      expect(value.trim(), `${name} / ${locale} 的 ${key} 是空串`).not.toBe('');
    }
  }
}

describe('译文对齐', () => {
  test('公开页命名空间与英文源文完全相等', () => {
    expectAligned('public', publicCatalog, publicEn);
  });

  test('报错命名空间与英文源文完全相等', () => {
    expectAligned('errors', errorsCatalog, errorsEn);
  });

  test('后台命名空间与英文源文完全相等', async () => {
    for (const locale of TRANSLATED) {
      const bundle = await loadAdminBundle(locale);
      expect(Object.keys(bundle.admin).sort(), `admin / ${locale}`).toEqual(
        Object.keys(adminEn).sort(),
      );
      for (const [key, value] of Object.entries(bundle.admin)) {
        expect(value.trim(), `admin / ${locale} 的 ${key} 是空串`).not.toBe('');
      }
    }
  });

  test('每一种受支持的语言都真的换了一套文案', async () => {
    const en = await loadAdminBundle('en');
    for (const locale of SUPPORTED_LOCALES.filter((item) => item !== 'en')) {
      const bundle = await loadAdminBundle(locale);
      expect(bundle.admin['login.submit'], locale).not.toBe(en.admin['login.submit']);
    }
  });

  test('每种受支持的语言都有自称', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_LABELS[locale].trim()).not.toBe('');
    }
  });
});
