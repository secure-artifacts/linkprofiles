import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@link-profile/i18n';
import { useState } from 'react';
import { request } from '../api/client.js';
import { LocaleFlag } from './LocaleFlag.js';
import { useAdminT } from '../i18n/runtime.js';
import { Select } from '../ui/Select.js';
import { useToast } from '../ui/Toast.js';

/**
 * 顶栏的界面语言切换器。
 *
 * 摆在明面上而不是收进账号菜单：看不懂当前语言的人正是最需要它的人，
 * 而藏在菜单里要求他先读懂菜单项才找得到。
 *
 * 语言名一律显示自称 —— 翻译过的语言名会让人找不到自己的母语。
 */
export function LanguageSwitcher({
  current,
  onChanged,
}: {
  current: Locale;
  onChanged: (locale: Locale) => void;
}) {
  const t = useAdminT();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const pick = async (value: string) => {
    const locale = value as Locale;
    if (locale === current) return;

    setSaving(true);
    try {
      await request('/auth/language', { method: 'PUT', body: { uiLanguage: locale } });
      onChanged(locale);
      toast.success(t('account.language.saved'));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center text-muted">
      <div className="w-[186px]">
        <Select
          aria-label={t('account.menu.language')}
          size="sm"
          disabled={saving}
          value={current}
          options={SUPPORTED_LOCALES.map((locale) => ({
            value: locale,
            label: LOCALE_LABELS[locale],
            icon: <LocaleFlag locale={locale} />,
          }))}
          onChange={(value) => void pick(value)}
        />
      </div>
    </div>
  );
}
