import { Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { validateAccountName, validateInviteCode, validateShortName } from '@link-profile/shared';
import { request } from '../api/client.js';
import { useAdminT, useLocale } from '../i18n/runtime.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
import { Input, PasswordInput } from '../ui/Input.js';
import { useToast } from '../ui/Toast.js';
import { useRecaptcha } from './useRecaptcha.js';

interface PreviewResponse {
  regionName: string;
  shortName?: { available: boolean; reason: string | null };
}

/**
 * 自助注册页，见 ADR-0018。
 *
 * 与登录页共用同一套组件与版式，不新增服务端渲染路径，因此不触及 ADR-0004
 * 对公开页零 hydration 的约定 —— 后台本来就是 SPA。
 */
export function RegisterPage({ onBackToLogin }: { onBackToLogin: () => void }) {
  const t = useAdminT();
  const locale = useLocale();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [account, setAccount] = useState('');
  const [shortName, setShortName] = useState('');
  const [password, setPassword] = useState('');
  const [regionName, setRegionName] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [shortNameState, setShortNameState] = useState<'free' | 'taken' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);

  const [siteKey, setSiteKey] = useState<string | null>(null);
  const {
    container: captchaBox,
    token: captchaToken,
    reset: resetCaptcha,
  } = useRecaptcha(siteKey, locale);

  // 开局问一次配置：拿得到站点密钥就说明注册开着且配齐了，拿不到就直接告诉
  // 来人别填了，而不是让他填完一整张表才被拒。
  useEffect(() => {
    request<{ recaptchaSiteKey: string }>('/register/config')
      .then((config) => setSiteKey(config.recaptchaSiteKey))
      .catch(() => setClosed(true));
  }, []);

  /** 码填完就去换区域名，顺带问一句地址占没占。 */
  const probe = async (nextCode: string, nextShortName: string) => {
    const parsed = validateInviteCode(nextCode);
    if (!parsed.ok) {
      setRegionName(null);
      setShortNameState(null);
      return;
    }

    const query = new URLSearchParams({ code: parsed.value });
    if (nextShortName.trim()) query.set('shortName', nextShortName.trim());

    try {
      const res = await request<PreviewResponse>(`/register/preview?${query.toString()}`);
      setRegionName(res.regionName);
      setCodeError(null);
      setShortNameState(res.shortName ? (res.shortName.available ? 'free' : 'taken') : null);
    } catch (err) {
      setRegionName(null);
      setShortNameState(null);
      setCodeError((err as Error).message);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const parsedCode = validateInviteCode(code);
    if (!parsedCode.ok) return setCodeError(t(parsedCode.error as never));
    const parsedAccount = validateAccountName(account);
    if (!parsedAccount.ok) return toast.error(parsedAccount.error);
    const parsedShortName = validateShortName(shortName);
    if (!parsedShortName.ok) return toast.error(parsedShortName.error);
    if (password.length < 8) return toast.error(t('common.validation.passwordMin'));
    if (!captchaToken) return toast.error(t('register.captcha.required'));

    setSubmitting(true);
    try {
      await request('/register', {
        method: 'POST',
        body: {
          code: parsedCode.value,
          account: parsedAccount.value,
          shortName: parsedShortName.value,
          password,
          recaptchaToken: captchaToken,
        },
      });
      setDone(true);
    } catch (err) {
      // 一枚令牌只能用一次，失败之后必须重勾
      resetCaptcha();
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

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

      <div className="flex flex-1 items-center justify-center bg-bg p-6">
        {closed ? (
          <div className="w-full max-w-[380px]">
            <Alert tone="warning" message={t('register.closed')} />
            <Button variant="default" className="mt-6 w-full" onClick={onBackToLogin}>
              {t('register.backToLogin')}
            </Button>
          </div>
        ) : done ? (
          <div className="w-full max-w-[380px]">
            <Alert tone="info" message={t('register.done')} />
            <Button variant="primary" className="mt-6 w-full" onClick={onBackToLogin}>
              {t('register.backToLogin')}
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="w-full max-w-[380px]">
            <h2 className="font-display text-xl font-semibold text-fg">{t('register.title')}</h2>
            <p className="mt-1 text-[13px] text-muted">{t('register.subtitle')}</p>

            <div className="mt-6 flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-fg">{t('register.field.code')}</label>
              <Input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onBlur={() => void probe(code, shortName)}
              />
              {regionName ? (
                <p className="text-[12px] text-accent">
                  {t('register.joining', { region: regionName })}
                </p>
              ) : codeError ? (
                <p className="text-[12px] text-danger">{codeError}</p>
              ) : null}
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-fg">{t('login.field.account')}</label>
              <Input
                autoComplete="username"
                value={account}
                onChange={(e) => setAccount(e.target.value.toLowerCase())}
              />
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-fg">
                {t('register.field.shortName')}
              </label>
              <Input
                value={shortName}
                onChange={(e) => setShortName(e.target.value.toLowerCase())}
                onBlur={() => void probe(code, shortName)}
              />
              {shortNameState === 'taken' ? (
                <p className="text-[12px] text-danger">{t('register.shortName.taken')}</p>
              ) : shortNameState === 'free' ? (
                <p className="text-[12px] text-accent">{t('register.shortName.free')}</p>
              ) : (
                <span className="text-[12px] text-muted">
                  {t('register.field.shortName.hint', { origin: location.origin })}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-fg">{t('login.field.password')}</label>
              <PasswordInput
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {/* reCAPTCHA v2 复选框：必须由本人勾选，见 ADR-0022 */}
            <div ref={captchaBox} className="mt-5 flex justify-center" />

            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={!captchaToken}
              className="mt-4 w-full"
            >
              {t('register.submit')}
            </Button>

            <button
              type="button"
              onClick={onBackToLogin}
              className="mt-6 w-full border-t border-border pt-4 text-[12px] text-muted hover:text-fg"
            >
              {t('register.backToLogin')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
