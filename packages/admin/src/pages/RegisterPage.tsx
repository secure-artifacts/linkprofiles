import { type Locale } from '@link-profile/i18n';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  extractShortName,
  validateAccountName,
  validateInviteCode,
  validateShortName,
} from '@link-profile/shared';
import { request } from '../api/client.js';
import { useAdminT, useErrorT, useLocale } from '../i18n/runtime.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
import { Input, PasswordInput } from '../ui/Input.js';
import { useToast } from '../ui/Toast.js';
import { AuthLayout } from './AuthLayout.js';
import { useRecaptcha } from './useRecaptcha.js';

interface PreviewResponse {
  regionName: string;
  shortName?: { available: boolean; reason: string | null };
}

/** 地址探测的结果。格式不合法在本地就判完了，不占一次请求。 */
type AddressState = 'checking' | 'free' | 'taken' | 'retired' | null;

const PROBE_DELAY_MS = 400;

/**
 * 自助注册页，见 ADR-0018。
 *
 * 与登录页共用同一套组件与版式，不新增服务端渲染路径，因此不触及 ADR-0004
 * 对公开页零 hydration 的约定 —— 后台本来就是 SPA。
 */
export function RegisterPage({
  locale: uiLocale,
  onLocaleChange,
  onBackToLogin,
}: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onBackToLogin: () => void;
}) {
  const t = useAdminT();
  const errorT = useErrorT();
  const locale = useLocale();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [account, setAccount] = useState('');
  const [shortName, setShortName] = useState('');
  const [password, setPassword] = useState('');
  const [regionName, setRegionName] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [addressState, setAddressState] = useState<AddressState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);

  const [siteKey, setSiteKey] = useState<string | null>(null);
  const {
    container: captchaBox,
    token: captchaToken,
    reset: resetCaptcha,
  } = useRecaptcha(siteKey, locale);

  const parsedShortName = validateShortName(shortName);
  // 域名印在输入框里，用户填的就只是后面那一段
  const host = location.host;
  const probeShortName = parsedShortName.ok ? parsedShortName.value : '';
  const previewUrl = probeShortName ? `${host}/${probeShortName}` : null;

  // 开局问一次配置：拿得到站点密钥就说明注册开着且配齐了，拿不到就直接告诉
  // 来人别填了，而不是让他填完一整张表才被拒。
  useEffect(() => {
    request<{ recaptchaSiteKey: string }>('/register/config')
      .then((config) => setSiteKey(config.recaptchaSiteKey))
      .catch(() => setClosed(true));
  }, []);

  /**
   * 边打字边问服务端：这个码属于哪个区域，这个地址还空不空。
   *
   * 只在两边都过了本地校验后才发请求。格式错本地就能判，让服务端回一句
   * 「不可用」反而看不出错在格式还是撞名。
   */
  useEffect(() => {
    const parsedCode = validateInviteCode(code);
    if (!parsedCode.ok) {
      setRegionName(null);
      setAddressState(null);
      return;
    }

    const query = new URLSearchParams({ code: parsedCode.value });
    if (probeShortName) {
      query.set('shortName', probeShortName);
      setAddressState('checking');
    } else {
      setAddressState(null);
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      request<PreviewResponse>(`/register/preview?${query.toString()}`)
        .then((res) => {
          if (cancelled) return;
          setRegionName(res.regionName);
          setCodeError(null);
          setAddressState(addressStateOf(res.shortName));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setRegionName(null);
          setAddressState(null);
          setCodeError((err as Error).message);
        });
    }, PROBE_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, probeShortName]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const parsedCode = validateInviteCode(code);
    if (!parsedCode.ok) return setCodeError(errorT(parsedCode.error));
    const parsedAccount = validateAccountName(account);
    if (!parsedAccount.ok) return toast.error(errorT(parsedAccount.error));
    if (!parsedShortName.ok) return toast.error(errorT(parsedShortName.error));
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
      resetCaptcha();
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout locale={uiLocale} onLocaleChange={onLocaleChange}>
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
            <Input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
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
              addonBefore={`${host}/`}
              placeholder="north-manila"
              value={shortName}
              onChange={(e) => setShortName(extractShortName(e.target.value))}
            />
            <AddressHint
              error={shortName === '' || parsedShortName.ok ? null : errorT(parsedShortName.error)}
              url={previewUrl}
              state={addressState}
            />
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-fg">{t('login.field.password')}</label>
            <PasswordInput
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

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
    </AuthLayout>
  );
}

/** 服务端只说「可用与否」加一个原因，这里翻成看得懂的三种结局。 */
function addressStateOf(result: PreviewResponse['shortName']): AddressState {
  if (!result) return null;
  if (result.available) return 'free';
  return result.reason === 'short_name_retired' ? 'retired' : 'taken';
}

const STATE_LABELS = {
  checking: 'register.shortName.checking',
  free: 'register.shortName.free',
  taken: 'register.shortName.taken',
  retired: 'register.shortName.retired',
} as const;

const STATE_TONES = {
  checking: 'text-muted',
  free: 'text-accent',
  taken: 'text-danger',
  retired: 'text-danger',
} as const;

/**
 * 地址那一行的提示：地址长什么样、能不能用。
 *
 * 完整地址一直摆在眼前，是因为「页面地址」这个字段名本身没说清填进去会
 * 变成什么 —— 有人照着旧提示把整条 URL 贴了进来。
 */
function AddressHint({
  error,
  url,
  state,
}: {
  error: string | null;
  url: string | null;
  state: AddressState;
}) {
  const t = useAdminT();

  if (error) return <p className="text-[12px] text-danger">{error}</p>;
  if (!url)
    return <span className="text-[12px] text-muted">{t('register.field.shortName.hint')}</span>;

  return (
    <p className="text-[12px] text-fg">
      <span className="font-medium">{url}</span>
      {state ? <span className={STATE_TONES[state]}> · {t(STATE_LABELS[state])}</span> : null}
    </p>
  );
}
