import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@link-profile/i18n';
import { LocaleFlag } from './LocaleFlag.js';
import { useAdminT } from '../i18n/runtime.js';
import { Select } from '../ui/Select.js';

/**
 * 界面语言下拉本身，不管落库。
 *
 * 顶栏那个要把选择写回账号，登录页那个只能改本地 —— 还没有会话，写不了。
 * 两处共用这一个下拉，宽度与国旗才不会分叉。
 *
 * 语言名一律显示自称：翻译过的语言名会让人找不到自己的母语。
 */
export function LocaleSelect({
  current,
  disabled,
  onPick,
}: {
  current: Locale;
  disabled?: boolean;
  onPick: (locale: Locale) => void;
}) {
  const t = useAdminT();

  return (
    <div className="w-[186px]">
      <Select
        aria-label={t('account.menu.language')}
        size="sm"
        disabled={disabled}
        value={current}
        options={SUPPORTED_LOCALES.map((locale) => ({
          value: locale,
          label: LOCALE_LABELS[locale],
          icon: <LocaleFlag locale={locale} />,
        }))}
        onChange={(value) => onPick(value as Locale)}
      />
    </div>
  );
}
