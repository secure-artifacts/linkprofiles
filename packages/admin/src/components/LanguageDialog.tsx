import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@link-profile/i18n';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { request } from '../api/client.js';
import { useAdminT } from '../i18n/runtime.js';
import { Dialog } from '../ui/Dialog.js';
import { useToast } from '../ui/Toast.js';

/**
 * 切换界面语言。选择写回账号而不是浏览器，换一台设备登录仍是同一种语言。
 *
 * 语言名一律显示自称：界面正是当前看不懂的那种语言时，翻译过的语言名反而
 * 让人找不到自己的母语。
 */
export function LanguageDialog({
  open,
  current,
  onClose,
  onChanged,
}: {
  open: boolean;
  current: Locale;
  onClose: () => void;
  onChanged: (locale: Locale) => void;
}) {
  const t = useAdminT();
  const toast = useToast();
  const [saving, setSaving] = useState<Locale | null>(null);

  const pick = async (locale: Locale) => {
    if (locale === current) return onClose();

    setSaving(locale);
    try {
      await request('/auth/language', { method: 'PUT', body: { uiLanguage: locale } });
      onChanged(locale);
      toast.success(t('account.language.saved'));
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={t('account.menu.language')}
    >
      <div className="flex flex-col gap-1">
        {SUPPORTED_LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            disabled={saving !== null}
            onClick={() => void pick(locale)}
            className={`flex items-center justify-between rounded-[var(--radius-control)] px-3 py-2 text-left
              text-[13px] transition-colors hover:bg-surface-hover disabled:opacity-60
              ${locale === current ? 'text-fg' : 'text-muted'}`}
          >
            {LOCALE_LABELS[locale]}
            {locale === current ? <Check className="size-4 text-accent" /> : null}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
