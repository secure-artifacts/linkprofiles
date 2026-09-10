import { type Locale } from '@link-profile/i18n';
import { Link2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { LocaleSelect } from '../components/LocaleSelect.js';
import { useAdminT } from '../i18n/runtime.js';

/**
 * 登录页与注册页的外壳：左边品牌区，右边表单，右上角语言切换。
 *
 * 语言切换在这一层而不是各自页面里：还没登录的人如果读不懂界面，
 * 连「哪个是登录框」都判断不了，两个页面都必须给得出这个出口。
 */
export function AuthLayout({
  locale,
  onLocaleChange,
  children,
}: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  children: ReactNode;
}) {
  const t = useAdminT();

  return (
    <div className="flex min-h-dvh">
      <div className="relative hidden w-[420px] shrink-0 flex-col justify-between overflow-hidden bg-[oklch(0.22_0.03_155)] p-10 text-white md:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative flex items-center gap-2 font-display text-lg font-semibold">
          <span className="flex size-7 items-center justify-center rounded-[6px] border border-white/40">
            <Link2 className="size-4" />
          </span>
          Link Profile
        </div>

        <div className="relative">
          <span className="mb-6 block h-0.5 w-10 rounded-full bg-accent" />
          <h1 className="font-display text-[34px] font-bold leading-tight">
            {t('login.hero.titleLine1')}
            <br />
            {t('login.hero.titleLine2')}
          </h1>
          <p className="mt-4 max-w-[30ch] text-[13px] text-white/70">{t('login.hero.subtitle')}</p>
        </div>

        <p className="relative text-[12px] text-white/40">{t('login.hero.footer')}</p>
      </div>

      {/* 切换器占一行而不是浮在角上：注册页内容比视口高时，浮着会压住表单 */}
      <div className="flex flex-1 flex-col bg-bg p-6">
        <div className="flex justify-end">
          <LocaleSelect current={locale} onPick={onLocaleChange} />
        </div>
        <div className="flex flex-1 items-center justify-center py-6">{children}</div>
      </div>
    </div>
  );
}
