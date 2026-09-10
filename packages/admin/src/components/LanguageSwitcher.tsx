import { type Locale } from '@link-profile/i18n';
import { useState } from 'react';
import { request } from '../api/client.js';
import { LocaleSelect } from './LocaleSelect.js';
import { useAdminT } from '../i18n/runtime.js';
import { useToast } from '../ui/Toast.js';

/**
 * 顶栏的界面语言切换器，选完写回账号。
 *
 * 摆在明面上而不是收进账号菜单：看不懂当前语言的人正是最需要它的人，
 * 而藏在菜单里要求他先读懂菜单项才找得到。
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

  const pick = async (locale: Locale) => {
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
      <LocaleSelect current={current} disabled={saving} onPick={(locale) => void pick(locale)} />
    </div>
  );
}
