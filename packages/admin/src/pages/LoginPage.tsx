import { type Locale } from '@link-profile/i18n';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { request } from '../api/client.js';
import type { Session } from '../api/types.js';
import { Button } from '../ui/Button.js';
import { Input, PasswordInput } from '../ui/Input.js';
import { useToast } from '../ui/Toast.js';
import { useAdminT } from '../i18n/runtime.js';
import { AuthLayout } from './AuthLayout.js';

export function LoginPage({
  locale,
  onLocaleChange,
  onSignedIn,
  onRegister,
}: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onSignedIn: (session: Session) => void;
  onRegister: () => void;
}) {
  const t = useAdminT();
  const toast = useToast();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ account?: string; password?: string }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!account) nextErrors.account = t('login.error.accountRequired');
    if (!password) nextErrors.password = t('login.error.passwordRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      onSignedIn(
        await request<Session>('/auth/login', { method: 'POST', body: { account, password } }),
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout locale={locale} onLocaleChange={onLocaleChange}>
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-[380px]">
        <h2 className="font-display text-xl font-semibold text-fg">{t('login.title')}</h2>
        <p className="mt-1 text-[13px] text-muted">{t('login.subtitle')}</p>

        <div className="mt-6 flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">{t('login.field.account')}</label>
          <Input
            autoComplete="username"
            autoFocus
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          />
          {errors.account ? <p className="text-[12px] text-danger">{errors.account}</p> : null}
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">{t('login.field.password')}</label>
          <PasswordInput
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.password ? <p className="text-[12px] text-danger">{errors.password}</p> : null}
        </div>

        <Button type="submit" variant="primary" loading={submitting} className="mt-6 w-full">
          {t('login.submit')}
        </Button>

        <button
          type="button"
          onClick={onRegister}
          className="mt-6 w-full border-t border-border pt-4 text-[13px] text-accent hover:underline"
        >
          {t('register.link')}
        </button>

        <p className="mt-3 text-[12px] text-muted">{t('login.help')}</p>
      </form>
    </AuthLayout>
  );
}
